import sql from "mssql";
import { dbConnect } from "../database/dbConfig.js";
import nodemailer from "nodemailer";
import { sendPushNotification } from "../helper/sendNotifications.js";

// Utility: Fetch shop email
async function getShopEmail(pool, shopId) {
  const query = `
    SELECT Email 
    FROM Shops 
    WHERE Id = @ShopId;
  `;
  const result = await pool.request().input("ShopId", sql.UniqueIdentifier, shopId).query(query);
  return result.recordset.length ? result.recordset[0].Email : null;
}

// Utility: Validate coupon
async function validateCoupon(pool, couponCode, cartItems) {
  const query = `
    SELECT * 
    FROM Coupons 
    WHERE Code = @Code 
      AND StartDate <= GETDATE() 
      AND EndDate >= GETDATE() 
      AND (UsageLimit IS NULL OR UsageCount < UsageLimit);
  `;
  const result = await pool.request().input("Code", sql.NVarChar, couponCode).query(query);

  if (!result.recordset.length) throw new Error("Invalid or expired coupon code.");
  const coupon = result.recordset[0];

  const validShop = cartItems.find(shop => shop.shopId === coupon.VendorId);
  if (!validShop) throw new Error("The coupon is not valid for any shop in your cart.");

  const shopTotal = validShop.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  if (shopTotal < coupon.MinimumOrderValue) {
    throw new Error(`Order total for the shop must be at least ${coupon.MinimumOrderValue} to use this coupon.`);
  }

  let discountAmount = 0;
  if (coupon.DiscountType === "percentage") {
    discountAmount = (shopTotal * coupon.DiscountValue) / 100;
  } else if (coupon.DiscountType === "fixed") {
    discountAmount = coupon.DiscountValue;
  }

  return {
    discountAmount: Math.min(discountAmount, shopTotal),
    couponId: coupon.CouponId,
  };
}

// Utility: Insert order products
async function insertOrderProducts(pool, subOrderId, shopProducts) {
  const query = `
    INSERT INTO OrderProducts 
    (OrderId, ProductId, Quantity, Price, SelectedSize, SelectedColor, SelectedImage, ShopId)
    VALUES (@OrderId, @ProductId, @Quantity, @Price, @SelectedSize, @SelectedColor, @SelectedImage, @ShopId);
  `;
  for (const product of shopProducts) {
    if (!product.id || !product.quantity || !product.price) {
      console.error(`Missing mandatory fields for product ${product.id}`);
      continue;
    }

    await pool
      .request()
      .input("OrderId", sql.UniqueIdentifier, subOrderId)
      .input("ProductId", sql.UniqueIdentifier, product.id)
      .input("Quantity", sql.Int, product.quantity)
      .input("Price", sql.Decimal, product.price)
      .input("SelectedSize", sql.NVarChar, product.size || "Default Size")
      .input("SelectedColor", sql.NVarChar, product.color || "Default Color")
      .input("SelectedImage", sql.NVarChar, product.image || "Default Image")
      .input("ShopId", sql.UniqueIdentifier, product.shopId)
      .query(query);
  }
}

// Main Function
async function createOrders(req, res) {
  const {
    fullName,
    country,
    streetAddressLine1,
    streetAddressLine2,
    city,
    state,
    zipCode,
    phoneNumber,
    email,
    userId,
    cartItems,
    couponCode,
  } = req.body;

  const address = `${streetAddressLine1}, ${city}, ${zipCode}, ${state}`;

  try {
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      throw new Error("cartItems must be a non-empty array");
    }

    const pool = await sql.connect(dbConnect);

    const totalAmount = cartItems.reduce((acc, shop) => {
      const shopTotal = shop.items.reduce(
        (shopAcc, item) => shopAcc + item.price * item.quantity,
        0
      );
      return acc + shopTotal;
    }, 0);

    let discountAmount = 0;
    let couponId = null;

    if (couponCode) {
      ({ discountAmount, couponId } = await validateCoupon(pool, couponCode, cartItems));
    }

    const finalAmount = totalAmount - discountAmount;

    const parentOrderQuery = `
      INSERT INTO Orders (FullName, Country, StreetAddressLine1, StreetAddressLine2, Province, City, ZipCode, PhoneNumber, Email, Amount, TotalAmount, UserId, Status)
      OUTPUT inserted.Id
      VALUES (@FullName, @Country, @StreetAddressLine1, @StreetAddressLine2, @Province, @City, @ZipCode, @PhoneNumber, @Email, @Amount, @TotalAmount, @UserId, 'Pending');
    `;
    const parentOrderResult = await pool.request()
      .input("FullName", sql.NVarChar, fullName)
      .input("Country", sql.NVarChar, country)
      .input("StreetAddressLine1", sql.NVarChar, streetAddressLine1)
      .input("StreetAddressLine2", sql.NVarChar, streetAddressLine2)
      .input("Province", sql.NVarChar, state)
      .input("City", sql.NVarChar, city)
      .input("ZipCode", sql.NVarChar, zipCode)
      .input("PhoneNumber", sql.NVarChar, phoneNumber)
      .input("Email", sql.NVarChar, email)
      .input("Amount", sql.Decimal, finalAmount)
      .input("TotalAmount", sql.Decimal, totalAmount)
      .input("UserId", sql.UniqueIdentifier, userId)
      .query(parentOrderQuery);

    const parentOrderId = parentOrderResult.recordset[0].Id;

    for (const shop of cartItems) {
      const shopProducts = shop.items;
      const shopTotalAmount = shopProducts.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
      );

      const shopDiscount = couponCode && shop.shopId === couponId ? discountAmount : 0;
      const shopFinalAmount = shopTotalAmount - shopDiscount;

      const vendorEmail = await getShopEmail(pool, shop.shopId);
      if (!vendorEmail) {
        console.error(`No shop found with Id: ${shop.shopId}`);
        continue;
      }

      const subOrderQuery = `
        INSERT INTO Orders (ParentOrderId, FullName, Country, StreetAddressLine1, StreetAddressLine2, Province, City, ZipCode, PhoneNumber, Email, Amount, TotalAmount, UserId, ShopId, Status)
        OUTPUT inserted.Id
        VALUES (@ParentOrderId, @FullName, @Country, @StreetAddressLine1, @StreetAddressLine2, @Province, @City, @ZipCode, @PhoneNumber, @Email, @Amount, @TotalAmount, @UserId, @ShopId, 'Pending');
      `;
      const subOrderResult = await pool.request()
        .input("ParentOrderId", sql.UniqueIdentifier, parentOrderId)
        .input("FullName", sql.NVarChar, fullName)
        .input("Country", sql.NVarChar, country)
        .input("StreetAddressLine1", sql.NVarChar, streetAddressLine1)
        .input("StreetAddressLine2", sql.NVarChar, streetAddressLine2)
        .input("Province", sql.NVarChar, state)
        .input("City", sql.NVarChar, city)
        .input("ZipCode", sql.NVarChar, zipCode)
        .input("PhoneNumber", sql.NVarChar, phoneNumber)
        .input("Email", sql.NVarChar, email)
        .input("Amount", sql.Decimal, shopFinalAmount)
        .input("TotalAmount", sql.Decimal, shopTotalAmount)
        .input("UserId", sql.UniqueIdentifier, userId)
        .input("ShopId", sql.UniqueIdentifier, shop.shopId)
        .query(subOrderQuery);

      const subOrderId = subOrderResult.recordset[0].Id;

      await insertOrderProducts(pool, subOrderId, shopProducts);

      const tokenQuery = `
        SELECT DeviceToken FROM ShopTokens WHERE ShopId = @ShopId;
      `;
      const tokenResult = await pool.request().input("ShopId", sql.UniqueIdentifier, shop.shopId).query(tokenQuery);
      if (tokenResult.recordset.length > 0) {
        const expoPushToken = tokenResult.recordset[0].DeviceToken;
        await sendPushNotification(expoPushToken, parentOrderId);
      }
    }

    if (couponId) {
      await pool.request()
        .input("CouponId", sql.UniqueIdentifier, couponId)
        .query(`
          UPDATE Coupons 
          SET UsageCount = UsageCount + 1 
          WHERE CouponId = @CouponId;
        `);

      await pool.request()
        .input("CouponId", sql.UniqueIdentifier, couponId)
        .input("UserId", sql.UniqueIdentifier, userId)
        .input("OrderId", sql.UniqueIdentifier, parentOrderId)
        .query(`
          INSERT INTO CouponUsage (CouponId, UserId, OrderId)
          VALUES (@CouponId, @UserId, @OrderId);
        `);
    }

    res.status(201).json({ message: "Orders created successfully", parentOrderId });
  } catch (error) {
    console.error("Error creating orders:", error);
    res.status(500).json({ error: error.message });
  }
}

export default createOrders;

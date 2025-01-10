import sql from "mssql";
import { dbConnect } from "../database/dbConfig.js";
import nodemailer from "nodemailer";
import { sendPushNotification } from "../helper/sendNotifications.js";
import { v4 as uuidv4 } from "uuid";

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
  const orderGroupId = uuidv4();
  const address = `${
    streetAddressLine1 + "," + city + "," + zipCode + "," + state
  }`;
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

    console.log("Total amount:", totalAmount);

    let discountAmount = 0;
    let couponId = null;
    let couponVendorId = null;

    if (couponCode) {
      const couponResult = await pool
        .request()
        .input("Code", sql.NVarChar, couponCode).query(`
          SELECT * 
          FROM Coupons 
          WHERE Code = @Code AND StartDate <= GETDATE() AND EndDate >= GETDATE() AND (UsageLimit IS NULL OR UsageCount < UsageLimit)
        `);

      if (couponResult.recordset.length > 0) {
        const coupon = couponResult.recordset[0];
        couponId = coupon.CouponId;
        couponVendorId = coupon.VendorId;

        const validShop = cartItems.find(
          (shop) => shop.shopId === coupon.VendorId
        );
        if (!validShop) {
          throw new Error("The coupon is not valid for any shop in your cart.");
        }

        const shopTotal = validShop.items.reduce(
          (acc, item) => acc + item.price * item.quantity,
          0
        );

        if (shopTotal >= coupon.MinimumOrderValue) {
          if (coupon.DiscountType === "Percentage") {
            discountAmount = (shopTotal * coupon.DiscountValue) / 100;
          } else if (coupon.DiscountType === "Flat") {
            discountAmount = coupon.DiscountValue;
          }

          discountAmount = Math.min(discountAmount, shopTotal);
        } else {
          throw new Error(
            `Order total for the shop must be at least ${coupon.MinimumOrderValue} to use this coupon.`
          );
        }
      } else {
        throw new Error("Invalid or expired coupon code.");
      }
    }
    console.log("dicount amount", discountAmount);

    const finalAmount = totalAmount - discountAmount;
    console.log("Final amount after discount:", finalAmount);

    const parentOrderResult = await pool
      .request()
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
      .input("Discount", sql.Decimal, discountAmount)
      .input("UserId", sql.UniqueIdentifier, userId)
      .input("OrderGroupId", sql.UniqueIdentifier, orderGroupId).query(`
                INSERT INTO Orders (FullName, Country, StreetAddressLine1, StreetAddressLine2, Province, City, ZipCode, PhoneNumber, Email, Amount, TotalAmount, Discount, UserId, OrderGroupId, Status)
                OUTPUT inserted.Id
                VALUES (@FullName, @Country, @StreetAddressLine1, @StreetAddressLine2, @Province, @City, @ZipCode, @PhoneNumber, @Email, @Amount, @TotalAmount, @Discount, @UserId, @OrderGroupId, 'Pending');
            `);

    const parentOrderId = parentOrderResult.recordset[0].Id;
    let vendorEmail;
    let shopProducts;
    let shopTotalAmount;
    for (const shop of cartItems) {
      shopProducts = shop.items;
      shopTotalAmount = shopProducts.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
      );
      console.log('shop total amount', shopTotalAmount)
      console.log('couponid', couponId)
      const shopDiscount =
      couponCode && shop.shopId === couponVendorId ? discountAmount : 0;
      const shopFinalAmount = shopTotalAmount - shopDiscount;
      console.log('shop final amount', shopFinalAmount)
      console.log('shop discount', shopDiscount)
      const shopResult = await pool
        .request()
        .input("ShopId", sql.UniqueIdentifier, shop.shopId).query(`
                SELECT Email 
                FROM Shops 
                WHERE Id = @ShopId
            `);

      if (!shopResult.recordset.length) {
        console.error(`No shop found with Id: ${shop.shopId}`);
        continue;
      }

      vendorEmail = shopResult.recordset[0].Email;

      const subOrderResult = await pool
        .request()
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
        .input("Discount", sql.Decimal, discountAmount)
        .input("UserId", sql.UniqueIdentifier, userId)
        .input("ShopId", sql.UniqueIdentifier, shop.shopId)
        .input("OrderGroupId", sql.UniqueIdentifier, orderGroupId).query(`
                    INSERT INTO Orders (ParentOrderId, FullName, Country, StreetAddressLine1, StreetAddressLine2, Province, City, ZipCode, PhoneNumber, Email, Amount, TotalAmount, Discount, UserId, ShopId, OrderGroupId, Status)
                    OUTPUT inserted.Id
                    VALUES (@ParentOrderId, @FullName, @Country, @StreetAddressLine1, @StreetAddressLine2, @Province, @City, @ZipCode, @PhoneNumber, @Email, @Amount, @TotalAmount, @Discount, @UserId, @ShopId, @OrderGroupId, 'Pending');
                `);
      const tokenQuery = `
                SELECT DeviceToken FROM ShopTokens WHERE ShopId = @ShopId
            `;
      // const result = await sql.query(tokenQuery, { shopId });

      // if (result.recordset.length > 0) {
      //   const expoPushToken = result.recordset[0].DeviceToken;
      //   await sendPushNotification(expoPushToken, orderId);
      // }
      const tokenResult = await pool
        .request()
        .input("ShopId", sql.UniqueIdentifier, shop.shopId)
        .query(tokenQuery);

      if (tokenResult.recordset.length > 0) {
        const expoPushToken = tokenResult.recordset[0].DeviceToken;
        await sendPushNotification(expoPushToken, parentOrderId);
      }

      const subOrderId = subOrderResult.recordset[0].Id;

      for (const product of shopProducts) {
        console.log("Product details:", product);

        if (!product.id || !product.quantity || !product.price) {
          console.error(`Missing mandatory fields for product ${product.id}`);
          continue;
        }

        const selectedSize = product.size || "Default Size";
        const selectedColor = product.color || "Default Color";
        const selectedImage = product.image || "Default Image";

        await pool
          .request()
          .input("OrderId", sql.UniqueIdentifier, subOrderId)
          .input("ProductId", sql.UniqueIdentifier, product.id)
          .input("Quantity", sql.Int, product.quantity)
          .input("Price", sql.Decimal, product.price)
          .input("SelectedSize", sql.NVarChar, selectedSize)
          .input("SelectedColor", sql.NVarChar, selectedColor)
          .input("SelectedImage", sql.NVarChar, selectedImage)
          .input("ShopId", sql.UniqueIdentifier, product.shopId)
          .input("OrderGroupId", sql.UniqueIdentifier, orderGroupId).query(`
            INSERT INTO OrderProducts (OrderId, ProductId, Quantity, Price, SelectedSize, SelectedColor, SelectedImage, ShopId, OrderGroupId)
            VALUES (@OrderId, @ProductId, @Quantity, @Price, @SelectedSize, @SelectedColor, @SelectedImage, @ShopId, @OrderGroupId);
        `);
      }
    }
    console.log("shop email", vendorEmail);
    const htmlContentForUser = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Slip</title>
  <style>
    body {
      font-family: 'Arial', sans-serif;
      background-color: #f9f9f9;
      margin: 0;
      padding: 0;
    }
    .container {
      width: 100%;
      max-width: 600px;
      margin: 20px auto;
      background-color: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background-color: #ff6f00;
      color: #fff;
      padding: 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .content {
      padding: 20px;
    }
    .order-details {
      margin-bottom: 20px;
      line-height: 1.6;
    }
    .order-details p {
      margin: 0 0 8px;
      color: #555;
    }
    .order-items {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .order-items th {
      background-color: #ffe0b2;
      color: #555;
      text-align: left;
      padding: 10px;
      font-size: 14px;
    }
    .order-items td {
      padding: 10px;
      border: 1px solid #ddd;
      font-size: 14px;
      color: #555;
    }
    .order-items tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    .order-total {
      text-align: right;
      font-size: 18px;
      font-weight: bold;
      margin-top: 10px;
      color: #ff6f00;
    }
    .footer {
      background-color: #fafafa;
      text-align: center;
      padding: 15px;
      font-size: 12px;
      color: #999;
      border-top: 1px solid #eee;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>HiBuyShopping - Order Receipt</h1>
    </div>
    <div class="content">
      <div class="order-details">
      <p>Thank you for your order, <strong>${fullName}</strong>!</p>
      <p><strong>Order Number:</strong> ${parentOrderId}</p>
      </div>
      <table class="order-items">
        <thead>
          <tr>
            <th>Product</th>
            <th>Quantity</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
           ${cartItems
             .flatMap((shop) =>
               shop.items.map(
                 (item) => `
            <tr>
              <td>${item.name}</td>
              <td>${item.quantity}</td>
              <td>${item.price}</td>
              <td>${item.price * item.quantity}</td>
            </tr>
          `
               )
             )
             .join("")}
        </tbody>
      </table>
      <div class="order-total">
        Total: ${totalAmount.toFixed(2)} PKR
      </div>
    </div>
    <div class="footer">
      &copy; 2024 HiBuyShopping. All rights reserved.
    </div>
  </div>
</body>
</html>
`;
    const htmlContentForVendor = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Order Notification</title>
  <style>
    body {
      font-family: 'Arial', sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f9f9f9;
    }
    .container {
      width: 100%;
      max-width: 700px;
      margin: 20px auto;
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background-color: #343a40;
      color: #ffffff;
      padding: 20px 40px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: bold;
    }
    .header p {
      margin: 5px 0 0;
      font-size: 14px;
      opacity: 0.8;
    }
    .content {
      padding: 30px 40px;
    }
    .notification {
      font-size: 18px;
      margin-bottom: 20px;
      color: #444444;
    }
    .order-details {
      margin-bottom: 30px;
    }
    .order-details p {
      margin: 5px 0;
      font-size: 14px;
      color: #555555;
    }
    .order-items {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .order-items th {
      background-color: #ffc107;
      color: #333333;
      padding: 10px;
      text-align: left;
      font-size: 14px;
      border-bottom: 2px solid #ff9800;
    }
    .order-items td {
      padding: 12px 10px;
      border: 1px solid #dddddd;
      font-size: 14px;
      color: #666666;
    }
    .order-items tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    .total-summary {
      background-color: #f5f5f5;
      padding: 15px 20px;
      border: 1px solid #dddddd;
      border-radius: 6px;
    }
    .total-summary p {
      margin: 0;
      font-size: 16px;
      color: #444444;
    }
    .total-summary p span {
      font-weight: bold;
      color: #ff9800;
    }
    .footer {
      background-color: #f4f4f8;
      text-align: center;
      padding: 15px;
      font-size: 12px;
      color: #888888;
      border-top: 1px solid #eeeeee;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>HiBuyShopping - New Order Received</h1>
      <p>Order Notification for Vendor</p>
    </div>
    <div class="content">
      <div class="notification">
        <strong>Congratulations!</strong> You have received a new order. Please review the order details below.
      </div>
      <div class="order-details">
        <p><strong>Order Number:</strong> ${parentOrderId}</p>
        <p><strong>Customer Name:</strong> ${fullName}</p>
        <p><strong>Shipping Address:</strong> ${address}</p>
      </div>
      <table class="order-items">
        <thead>
          <tr>
            <th>Product</th>
            <th>Quantity</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
        ${shopProducts
          .map(
            (item) => `
            <tr>
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td>${item.price}</td>
                <td>${item.quantity * item.price}</td>
            </tr>`
          )
          .join("")}
        </tbody>
      </table>
      <div class="total-summary">
        <p><span>Total Amount:</span> ${shopTotalAmount.toFixed(2)} PKR</p>
      </div>
    </div>
    <div class="footer">
      <p>&copy; 2024 HiBuyShopping. All rights reserved.</p>
      <p><a href="https://hibuyshopping.com" style="color:#ff9800; text-decoration:none;">Visit Vendor Dashboard</a></p>
    </div>
  </div>
</body>
</html>
`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "hibuyshoppingofficial@gmail.com",
        pass: "albr myug eldw bzzf",
      },
    });
    await transporter.sendMail({
      from: "HiBuyShopping <hibuyshoppingofficial@gmail.com>",
      to: email,
      subject: "Order Confirmation - HiBuyShopping",
      html: htmlContentForUser,
    });

    // for (const shop of cartItems) {
    //     const vendorEmail = shop.Email;
    //     if (vendorEmail) {
    //         await transporter.sendMail({
    //             from: 'HiBuyShopping <hibuyshoppingofficial@gmail.com>',
    //             to: vendorEmail,
    //             subject: 'New Order Received - HiBuyShopping',
    //             html: htmlContentForVendor,
    //         });
    //     }
    // }

    if (vendorEmail) {
      await transporter.sendMail({
        from: "HiBuyShopping <hibuyshoppingofficial@gmail.com>",
        to: vendorEmail,
        subject: "New Order Received - HiBuyShopping",
        html: htmlContentForVendor,
      });
    }

    if (couponId) {
      await pool.request().input("CouponId", sql.UniqueIdentifier, couponId)
        .query(`
          UPDATE Coupons 
          SET UsageCount = UsageCount + 1 
          WHERE CouponId = @CouponId
        `);
      await pool
        .request()
        .input("CouponId", sql.UniqueIdentifier, couponId)
        .input("UserId", sql.UniqueIdentifier, userId)
        .input("OrderId", sql.UniqueIdentifier, parentOrderId).query(`
          INSERT INTO CouponUsage (CouponId, UserId, OrderId)
          VALUES (@CouponId, @UserId, @OrderId);
        `);
    }

    res
      .status(201)
      .json({ message: "Orders created successfully", parentOrderId });
  } catch (error) {
    console.error("Error creating orders:", error);
    res.status(500).json({ error: "Error creating orders" });
  }
}

export default createOrders;

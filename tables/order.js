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


    let orderTotalAmount;
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
        console.log("cartitems",cartItems)
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
      orderTotalAmount = (shopTotalAmount + 200) - shopDiscount;
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
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">

<head>
 <meta charset="UTF-8" />
 <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
 <!--[if !mso]><!-- -->
 <meta http-equiv="X-UA-Compatible" content="IE=edge" />
 <!--<![endif]-->
 <meta name="viewport" content="width=device-width, initial-scale=1.0" />
 <meta name="format-detection" content="telephone=no" />
 <meta name="format-detection" content="date=no" />
 <meta name="format-detection" content="address=no" />
 <meta name="format-detection" content="email=no" />
 <meta name="x-apple-disable-message-reformatting" />
 <link href="https://fonts.googleapis.com/css?family=Nunito+Sans:ital,wght@0,400;0,400;0,600;0,700;0,800" rel="stylesheet" />
 <link href="https://fonts.googleapis.com/css?family=Nunito:ital,wght@0,400;0,700" rel="stylesheet" />
 <title>Untitled</title>
 <style>
 html,
         body {
             margin: 0 !important;
             padding: 0 !important;
             min-height: 100% !important;
             width: 100% !important;
             -webkit-font-smoothing: antialiased;
         }
 
         * {
             -ms-text-size-adjust: 100%;
         }
 
         #outlook a {
             padding: 0;
         }
 
         .ReadMsgBody,
         .ExternalClass {
             width: 100%;
         }
 
         .ExternalClass,
         .ExternalClass p,
         .ExternalClass td,
         .ExternalClass div,
         .ExternalClass span,
         .ExternalClass font {
             line-height: 100%;
         }
 
         table,
         td,
         th {
             mso-table-lspace: 0 !important;
             mso-table-rspace: 0 !important;
             border-collapse: collapse;
         }
 
         u + .body table, u + .body td, u + .body th {
             will-change: transform;
         }
 
         body, td, th, p, div, li, a, span {
             -webkit-text-size-adjust: 100%;
             -ms-text-size-adjust: 100%;
             mso-line-height-rule: exactly;
         }
 
         img {
             border: 0;
             outline: 0;
             line-height: 100%;
             text-decoration: none;
             -ms-interpolation-mode: bicubic;
         }
 
         a[x-apple-data-detectors] {
             color: inherit !important;
             text-decoration: none !important;
         }
                 
         .body .pc-project-body {
             background-color: transparent !important;
         }
 
         @media (min-width: 621px) {
             .pc-lg-hide {
                 display: none;
             } 
 
             .pc-lg-bg-img-hide {
                 background-image: none !important;
             }
         }
 </style>
 <style>
 @media (max-width: 620px) {
 .pc-project-body {min-width: 0px !important;}
 .pc-project-container {width: 100% !important;}
 .pc-sm-hide, .pc-w620-gridCollapsed-1 > tbody > tr > .pc-sm-hide {display: none !important;}
 .pc-sm-bg-img-hide {background-image: none !important;}
 .pc-w620-padding-20-0-20-0 {padding: 20px 0px 20px 0px !important;}
 .pc-w620-itemsSpacings-0-8 {padding-left: 0px !important;padding-right: 0px !important;padding-top: 4px !important;padding-bottom: 4px !important;}
 .pc-w620-valign-middle {vertical-align: middle !important;}
 td.pc-w620-halign-center,th.pc-w620-halign-center {text-align: center !important;}
 table.pc-w620-halign-center {float: none !important;margin-right: auto !important;margin-left: auto !important;}
 img.pc-w620-halign-center {margin-right: auto !important;margin-left: auto !important;}
 .pc-w620-width-fill {width: 100% !important;}
 div.pc-w620-align-center,th.pc-w620-align-center,a.pc-w620-align-center,td.pc-w620-align-center {text-align: center !important;text-align-last: center !important;}
 table.pc-w620-align-center {float: none !important;margin-right: auto !important;margin-left: auto !important;}
 img.pc-w620-align-center {margin-right: auto !important;margin-left: auto !important;}
 .pc-w620-itemsSpacings-24-0 {padding-left: 12px !important;padding-right: 12px !important;padding-top: 0px !important;padding-bottom: 0px !important;}
 .pc-w620-padding-20-30-0-30 {padding: 20px 30px 0px 30px !important;}
 table.pc-w620-spacing-0-0-0-0 {margin: 0px 0px 0px 0px !important;}
 td.pc-w620-spacing-0-0-0-0,th.pc-w620-spacing-0-0-0-0{margin: 0 !important;padding: 0px 0px 0px 0px !important;}
 .pc-w620-itemsSpacings-0-30 {padding-left: 0px !important;padding-right: 0px !important;padding-top: 15px !important;padding-bottom: 15px !important;}
 .pc-w620-padding-32-20-40-20 {padding: 32px 20px 40px 20px !important;}
 .pc-w620-fontSize-36px {font-size: 36px !important;}
 .pc-w620-lineHeight-100pc {line-height: 100% !important;}
 table.pc-w620-spacing-0-0-12-0 {margin: 0px 0px 12px 0px !important;}
 td.pc-w620-spacing-0-0-12-0,th.pc-w620-spacing-0-0-12-0{margin: 0 !important;padding: 0px 0px 12px 0px !important;}
 .pc-w620-padding-0-0-0-0 {padding: 0px 0px 0px 0px !important;}
 .pc-w620-fontSize-14px {font-size: 14px !important;}
 table.pc-w620-spacing-0-0-24-0 {margin: 0px 0px 24px 0px !important;}
 td.pc-w620-spacing-0-0-24-0,th.pc-w620-spacing-0-0-24-0{margin: 0 !important;padding: 0px 0px 24px 0px !important;}
 .pc-w620-itemsSpacings-0-0 {padding-left: 0px !important;padding-right: 0px !important;padding-top: 0px !important;padding-bottom: 0px !important;}
 
 .pc-w620-width-hug {width: auto !important;}
 table.pc-w620-spacing-0-32-12-32 {margin: 0px 32px 12px 32px !important;}
 td.pc-w620-spacing-0-32-12-32,th.pc-w620-spacing-0-32-12-32{margin: 0 !important;padding: 0px 32px 12px 32px !important;}
 .pc-w620-width-32 {width: 32px !important;}
 .pc-w620-height-auto {height: auto !important;}
 .pc-w620-width-64 {width: 64px !important;}
 
 img.pc-w620-width-64-min {min-width: 64px !important;}
 .pc-w620-height-1 {height: 1px !important;}
 .pc-w620-valign-top {vertical-align: top !important;}
 .pc-w620-width-80 {width: 80px !important;}
 .pc-w620-width-100pc {width: 100% !important;}
 .pc-w620-padding-20-24-0-24 {padding: 20px 24px 0px 24px !important;}
 .pc-w620-fontSize-32px {font-size: 32px !important;}
 .pc-w620-lineHeight-40 {line-height: 40px !important;}
 table.pc-w620-spacing-0-0-4-0 {margin: 0px 0px 4px 0px !important;}
 td.pc-w620-spacing-0-0-4-0,th.pc-w620-spacing-0-0-4-0{margin: 0 !important;padding: 0px 0px 4px 0px !important;}
 .pc-w620-fontSize-16px {font-size: 16px !important;}
 .pc-w620-lineHeight-120pc {line-height: 120% !important;}
 td.pc-w620-halign-left,th.pc-w620-halign-left {text-align: left !important;}
 table.pc-w620-halign-left {float: none !important;margin-right: auto !important;margin-left: 0 !important;}
 img.pc-w620-halign-left {margin-right: auto !important;margin-left: 0 !important;}
 .pc-w620-padding-20-0-20-20 {padding: 20px 0px 20px 20px !important;}
 div.pc-w620-align-left,th.pc-w620-align-left,a.pc-w620-align-left,td.pc-w620-align-left {text-align: left !important;text-align-last: left !important;}
 table.pc-w620-align-left{float: none !important;margin-right: auto !important;margin-left: 0 !important;}
 img.pc-w620-align-left{margin-right: auto !important;margin-left: 0 !important;}
 .pc-w620-lineHeight-24 {line-height: 24px !important;}
 .pc-w620-valign-bottom {vertical-align: bottom !important;}
 td.pc-w620-halign-right,th.pc-w620-halign-right {text-align: right !important;}
 table.pc-w620-halign-right {float: none !important;margin-right: 0 !important;margin-left: auto !important;}
 img.pc-w620-halign-right {margin-right: 0 !important;margin-left: auto !important;}
 .pc-w620-padding-20-20-20-0 {padding: 20px 20px 20px 0px !important;}
 .pc-w620-lineHeight-22 {line-height: 22px !important;}
 div.pc-w620-align-right,th.pc-w620-align-right,a.pc-w620-align-right,td.pc-w620-align-right {text-align: right !important;text-align-last: right !important;}
 table.pc-w620-align-right{float: none !important;margin-left: auto !important;margin-right: 0 !important;}
 img.pc-w620-align-right{margin-right: 0 !important;margin-left: auto !important;}
 .pc-w620-fontSize-16 {font-size: 16px !important;}
 .pc-w620-lineHeight-26 {line-height: 26px !important;}
 table.pc-w620-spacing-0-0-8-0 {margin: 0px 0px 8px 0px !important;}
 td.pc-w620-spacing-0-0-8-0,th.pc-w620-spacing-0-0-8-0{margin: 0 !important;padding: 0px 0px 8px 0px !important;}
 table.pc-w620-spacing-174-0-0-40 {margin: 174px 0px 0px 40px !important;}
 td.pc-w620-spacing-174-0-0-40,th.pc-w620-spacing-174-0-0-40{margin: 0 !important;padding: 174px 0px 0px 40px !important;}
 .pc-w620-lineHeight-20 {line-height: 20px !important;}
 .pc-w620-padding-40-24-0-24 {padding: 40px 24px 0px 24px !important;}
 .pc-w620-itemsSpacings-0-16 {padding-left: 0px !important;padding-right: 0px !important;padding-top: 8px !important;padding-bottom: 8px !important;}
 .pc-w620-padding-40-24-32-24 {padding: 40px 24px 32px 24px !important;}
 .pc-w620-padding-32-0-0-0 {padding: 32px 0px 0px 0px !important;}
 table.pc-w620-spacing-0-24-10-24 {margin: 0px 24px 10px 24px !important;}
 td.pc-w620-spacing-0-24-10-24,th.pc-w620-spacing-0-24-10-24{margin: 0 !important;padding: 0px 24px 10px 24px !important;}
 .pc-w620-lineHeight-140pc {line-height: 140% !important;}
 table.pc-w620-spacing-0-24-30-24 {margin: 0px 24px 30px 24px !important;}
 td.pc-w620-spacing-0-24-30-24,th.pc-w620-spacing-0-24-30-24{margin: 0 !important;padding: 0px 24px 30px 24px !important;}
 .pc-w620-padding-0-0-0-24 {padding: 0px 0px 0px 24px !important;}
 .pc-w620-padding-0-0-0-20 {padding: 0px 0px 0px 20px !important;}
 .pc-w620-height-100pc {height: 100% !important;}
 .pc-w620-padding-32-32-32-32 {padding: 32px 32px 32px 32px !important;}
 .pc-w620-fontSize-30 {font-size: 30px !important;}
 .pc-w620-lineHeight-28 {line-height: 28px !important;}
 .pc-w620-padding-30-24-0-24 {padding: 30px 24px 0px 24px !important;}
 .pc-w620-itemsSpacings-10-20 {padding-left: 5px !important;padding-right: 5px !important;padding-top: 10px !important;padding-bottom: 10px !important;}
 .pc-w620-itemsSpacings-0-20 {padding-left: 0px !important;padding-right: 0px !important;padding-top: 10px !important;padding-bottom: 10px !important;}
 .pc-w620-fontSize-20px {font-size: 20px !important;}
 .pc-w620-padding-32-24-32-24 {padding: 32px 24px 32px 24px !important;}
 .pc-w620-itemsSpacings-20-0 {padding-left: 10px !important;padding-right: 10px !important;padding-top: 0px !important;padding-bottom: 0px !important;}
 table.pc-w620-spacing-0-0-20-0 {margin: 0px 0px 20px 0px !important;}
 td.pc-w620-spacing-0-0-20-0,th.pc-w620-spacing-0-0-20-0{margin: 0 !important;padding: 0px 0px 20px 0px !important;}
 .pc-w620-padding-30-24-40-24 {padding: 30px 24px 40px 24px !important;}
 
 .pc-w620-gridCollapsed-1 > tbody,.pc-w620-gridCollapsed-1 > tbody > tr,.pc-w620-gridCollapsed-1 > tr {display: inline-block !important;}
 .pc-w620-gridCollapsed-1.pc-width-fill > tbody,.pc-w620-gridCollapsed-1.pc-width-fill > tbody > tr,.pc-w620-gridCollapsed-1.pc-width-fill > tr {width: 100% !important;}
 .pc-w620-gridCollapsed-1.pc-w620-width-fill > tbody,.pc-w620-gridCollapsed-1.pc-w620-width-fill > tbody > tr,.pc-w620-gridCollapsed-1.pc-w620-width-fill > tr {width: 100% !important;}
 .pc-w620-gridCollapsed-1 > tbody > tr > td,.pc-w620-gridCollapsed-1 > tr > td {display: block !important;width: auto !important;padding-left: 0 !important;padding-right: 0 !important;margin-left: 0 !important;}
 .pc-w620-gridCollapsed-1.pc-width-fill > tbody > tr > td,.pc-w620-gridCollapsed-1.pc-width-fill > tr > td {width: 100% !important;}
 .pc-w620-gridCollapsed-1.pc-w620-width-fill > tbody > tr > td,.pc-w620-gridCollapsed-1.pc-w620-width-fill > tr > td {width: 100% !important;}
 .pc-w620-gridCollapsed-1 > tbody > .pc-grid-tr-first > .pc-grid-td-first,pc-w620-gridCollapsed-1 > .pc-grid-tr-first > .pc-grid-td-first {padding-top: 0 !important;}
 .pc-w620-gridCollapsed-1 > tbody > .pc-grid-tr-last > .pc-grid-td-last,pc-w620-gridCollapsed-1 > .pc-grid-tr-last > .pc-grid-td-last {padding-bottom: 0 !important;}
 
 .pc-w620-gridCollapsed-0 > tbody > .pc-grid-tr-first > td,.pc-w620-gridCollapsed-0 > .pc-grid-tr-first > td {padding-top: 0 !important;}
 .pc-w620-gridCollapsed-0 > tbody > .pc-grid-tr-last > td,.pc-w620-gridCollapsed-0 > .pc-grid-tr-last > td {padding-bottom: 0 !important;}
 .pc-w620-gridCollapsed-0 > tbody > tr > .pc-grid-td-first,.pc-w620-gridCollapsed-0 > tr > .pc-grid-td-first {padding-left: 0 !important;}
 .pc-w620-gridCollapsed-0 > tbody > tr > .pc-grid-td-last,.pc-w620-gridCollapsed-0 > tr > .pc-grid-td-last {padding-right: 0 !important;}
 
 .pc-w620-tableCollapsed-1 > tbody,.pc-w620-tableCollapsed-1 > tbody > tr,.pc-w620-tableCollapsed-1 > tr {display: block !important;}
 .pc-w620-tableCollapsed-1.pc-width-fill > tbody,.pc-w620-tableCollapsed-1.pc-width-fill > tbody > tr,.pc-w620-tableCollapsed-1.pc-width-fill > tr {width: 100% !important;}
 .pc-w620-tableCollapsed-1.pc-w620-width-fill > tbody,.pc-w620-tableCollapsed-1.pc-w620-width-fill > tbody > tr,.pc-w620-tableCollapsed-1.pc-w620-width-fill > tr {width: 100% !important;}
 .pc-w620-tableCollapsed-1 > tbody > tr > td,.pc-w620-tableCollapsed-1 > tr > td {display: block !important;width: auto !important;}
 .pc-w620-tableCollapsed-1.pc-width-fill > tbody > tr > td,.pc-w620-tableCollapsed-1.pc-width-fill > tr > td {width: 100% !important;box-sizing: border-box !important;}
 .pc-w620-tableCollapsed-1.pc-w620-width-fill > tbody > tr > td,.pc-w620-tableCollapsed-1.pc-w620-width-fill > tr > td {width: 100% !important;box-sizing: border-box !important;}
 }
 </style>
 <!--[if !mso]><!-- -->
 <style>
 @font-face { font-family: 'Nunito Sans'; font-style: normal; font-weight: 700; src: url('https://fonts.gstatic.com/s/nunitosans/v15/pe1mMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q42ptCp5F5bxqqtQ1yiU4GMS5XvVUj.woff') format('woff'), url('https://fonts.gstatic.com/s/nunitosans/v15/pe1mMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q42ptCp5F5bxqqtQ1yiU4GMS5XvVUl.woff2') format('woff2'); } @font-face { font-family: 'Nunito Sans'; font-style: normal; font-weight: 600; src: url('https://fonts.gstatic.com/s/nunitosans/v15/pe1mMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q42ptCp5F5bxqqtQ1yiU4GCC5XvVUj.woff') format('woff'), url('https://fonts.gstatic.com/s/nunitosans/v15/pe1mMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q42ptCp5F5bxqqtQ1yiU4GCC5XvVUl.woff2') format('woff2'); } @font-face { font-family: 'Nunito Sans'; font-style: normal; font-weight: 400; src: url('https://fonts.gstatic.com/s/nunitosans/v15/pe1mMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q42ptCp5F5bxqqtQ1yiU4G1ilXvVUj.woff') format('woff'), url('https://fonts.gstatic.com/s/nunitosans/v15/pe1mMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q42ptCp5F5bxqqtQ1yiU4G1ilXvVUl.woff2') format('woff2'); } @font-face { font-family: 'Nunito Sans'; font-style: normal; font-weight: 800; src: url('https://fonts.gstatic.com/s/nunitosans/v15/pe1mMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q42ptCp5F5bxqqtQ1yiU4GVi5XvVUj.woff') format('woff'), url('https://fonts.gstatic.com/s/nunitosans/v15/pe1mMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q42ptCp5F5bxqqtQ1yiU4GVi5XvVUl.woff2') format('woff2'); } @font-face { font-family: 'Nunito'; font-style: normal; font-weight: 700; src: url('https://fonts.gstatic.com/s/nunito/v26/XRXI3I6Li01BKofiOc5wtlZ2di8HDFwmdTo3iQ.woff') format('woff'), url('https://fonts.gstatic.com/s/nunito/v26/XRXI3I6Li01BKofiOc5wtlZ2di8HDFwmdTo3jw.woff2') format('woff2'); }
 </style>
 <!--<![endif]-->
 <!--[if mso]>
    <style type="text/css">
        .pc-font-alt {
            font-family: Arial, Helvetica, sans-serif !important;
        }
    </style>
    <![endif]-->
 <!--[if gte mso 9]>
    <xml>
        <o:OfficeDocumentSettings>
            <o:AllowPNG/>
            <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
    </xml>
    <![endif]-->
</head>

<body class="body pc-font-alt" style="width: 100% !important; min-height: 100% !important; margin: 0 !important; padding: 0 !important; line-height: 1.5; color: #2D3A41; mso-line-height-rule: exactly; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; font-variant-ligatures: normal; text-rendering: optimizeLegibility; -moz-osx-font-smoothing: grayscale; background-color: #ffefcf;" bgcolor="#ffefcf">
 <table class="pc-project-body" style="table-layout: fixed; min-width: 600px; background-color: #ffefcf;" bgcolor="#ffefcf" width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
  <tr>
   <td align="center" valign="top">
    <table class="pc-project-container" align="center" width="600" style="width: 600px; max-width: 600px;" border="0" cellpadding="0" cellspacing="0" role="presentation">
     <tr>
      <td class="pc-w620-padding-20-0-20-0" style="padding: 20px 0px 20px 0px;" align="left" valign="top">
       <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="width: 100%;">
        <tr>
         <td valign="top">
          <!-- BEGIN MODULE: Menu -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
           <tr>
            <td class="pc-w620-spacing-0-0-0-0" style="padding: 0px 0px 0px 0px;">
             <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
              <tr>
               <td valign="top" class="pc-w620-padding-20-30-0-30" style="padding: 26px 32px 16px 32px; border-radius: 0px; background-color: #ffffff;" bgcolor="#ffffff">
                <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                 <tr>
                  <td class="pc-w620-valign-middle pc-w620-halign-center">
                   <table class="pc-width-fill pc-w620-gridCollapsed-1 pc-w620-halign-center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                    <tr class="pc-grid-tr-first pc-grid-tr-last">
                     <td class="pc-grid-td-first pc-w620-itemsSpacings-0-8" align="left" valign="middle" style="padding-top: 0px; padding-right: 10px; padding-bottom: 0px; padding-left: 0px;">
                      <table class="pc-w620-width-fill pc-w620-halign-center" style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                       <tr>
                        <td class="pc-w620-halign-center pc-w620-valign-middle" align="left" valign="top">
                         <table class="pc-w620-halign-center" align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                          <tr>
                           <td class="pc-w620-halign-center" align="left" valign="top">
                            <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td class="pc-w620-halign-center" align="left" valign="top">
                               <h1 style="color: #ff554a; font-weight: bold; font-size: 22px;">Hibuyshopping</h1>
                                <!-- <img src="https://cloudfilesdm.com/postcards/cda6b355a64016f7db4bd0c823c7694a.png" class="pc-w620-align-center" width="140" height="25" alt="" style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; object-fit: contain; width: 140px; height: auto; max-width: 100%; border: 0;" /> -->
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                         </table>
                        </td>
                       </tr>
                      </table>
                     </td>
                     <td class="pc-grid-td-last pc-w620-itemsSpacings-0-8" align="left" valign="middle" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 10px;">
                      <table class="pc-w620-halign-center" style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                       <tr>
                        <td class="pc-w620-halign-center pc-w620-valign-middle" align="right" valign="middle">
                         <table class="pc-w620-halign-center" align="right" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                          <tr>
                           <td class="pc-w620-halign-center" align="right" valign="top">
                            <table class="pc-w620-halign-center" align="right" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td align="left" style="padding: 12px 0px 0px 0px;">
                               <table class="pc-width-hug pc-w620-gridCollapsed-0" align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr class="pc-grid-tr-first pc-grid-tr-last">
                                 <td class="pc-grid-td-first pc-w620-itemsSpacings-24-0" valign="top" style="padding-top: 0px; padding-right: 10px; padding-bottom: 0px; padding-left: 0px;">
                                  <table style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td align="left" valign="top">
                                     <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="left" valign="top">
                                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" align="left" style="border-collapse: separate; border-spacing: 0;">
                                         <tr>
                                          <td valign="top" align="left">
                                           <div class="pc-font-alt" style="line-height: 121%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212; text-align: left; text-align-last: left;">
                                            <div><a href="https://hibuyshopping.com" target="_blank" style="color: #2D3A41; text-decoration: none;"><span>Shop</span></a>
                                            </div>
                                           </div>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-w620-itemsSpacings-24-0" valign="top" style="padding-top: 0px; padding-right: 10px; padding-bottom: 0px; padding-left: 10px;">
                                  <table style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td align="left" valign="top">
                                     <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="left" valign="top">
                                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" align="left" style="border-collapse: separate; border-spacing: 0;">
                                         <tr>
                                          <td valign="top" align="left">
                                           <div class="pc-font-alt" style="line-height: 121%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212; text-align: left; text-align-last: left;">
                                            <div><a href="https://hibuyshopping.com/contact-us" target="_blank" style="color: #2D3A41; text-decoration: none;"><span>Contact Us</span></a>
                                            </div>
                                           </div>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-w620-itemsSpacings-24-0" valign="top" style="padding-top: 0px; padding-right: 10px; padding-bottom: 0px; padding-left: 10px;">
                                  <table style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td align="left" valign="top">
                                     <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="left" valign="top">
                                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" align="left" style="border-collapse: separate; border-spacing: 0;">
                                         <tr>
                                          <td valign="top" align="left">
                                           <div class="pc-font-alt" style="line-height: 121%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212; text-align: left; text-align-last: left;">
                                            <div><a href="https://hibuyshopping.com/about-us" target="_blank" style="color: #2D3A41; text-decoration: none;"><span>About</span></a>
                                            </div>
                                           </div>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-grid-td-last pc-w620-itemsSpacings-24-0" valign="top" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 10px;">
                                  <table style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td align="left" valign="top">
                                     <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="left" valign="top">
                                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" align="left" style="border-collapse: separate; border-spacing: 0;">
                                         <tr>
                                          <td valign="top" align="left">
                                           <div class="pc-font-alt" style="line-height: 121%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212; text-align: left; text-align-last: left;">
                                            <div><a href="https://hibuyshopping.com/privacy-policy" target="_blank" style="color: #2D3A41; text-decoration: none;">Policy<span></a>
                                            </div>
                                           </div>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                         </table>
                        </td>
                       </tr>
                      </table>
                     </td>
                    </tr>
                   </table>
                  </td>
                 </tr>
                </table>
               </td>
              </tr>
             </table>
            </td>
           </tr>
          </table>
          <!-- END MODULE: Menu -->
         </td>
        </tr>
        <tr>
         <td valign="top">
          <!-- BEGIN MODULE: Order Status -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
           <tr>
            <td class="pc-w620-spacing-0-0-0-0" style="padding: 0px 0px 0px 0px;">
             <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
              <tr>
               <td valign="top" class="pc-w620-padding-20-24-0-24" style="padding: 0px 32px 0px 32px; border-radius: 0px; background-color: #FFFFFF;" bgcolor="#FFFFFF">
                <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                 <tr>
                  <td>
                   <table class="pc-width-fill pc-w620-gridCollapsed-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                    <tr class="pc-grid-tr-first pc-grid-tr-last">
                     <td class="pc-grid-td-first pc-grid-td-last pc-w620-itemsSpacings-0-30" align="left" valign="top" style="width: 50%; padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 0px;">
                      <table class="pc-w620-width-fill" style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                       <tr>
                        <td class="pc-w620-padding-32-20-40-20" align="center" valign="middle" style="padding: 48px 24px 48px 24px; background-color: #fff8f0; border-radius: 12px 12px 12px 12px;">
                         <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                          <tr>
                           <td align="center" valign="top">
                            <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td class="pc-w620-spacing-0-0-12-0" valign="top" style="padding: 0px 0px 12px 0px;">
                               <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                <tr>
                                 <td valign="top" class="pc-w620-padding-0-0-0-0" align="center" style="padding: 0px 0px 0px 0px;">
                                  <div class="pc-font-alt pc-w620-fontSize-36px pc-w620-lineHeight-100pc" style="line-height: 110%; letter-spacing: -1px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 44px; font-weight: bold; font-variant-ligatures: normal; color: #121212; text-align: center; text-align-last: center;">
                                   <div><span>Hooray! Your order has been confirmed.</span>
                                   </div>
                                  </div>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                          <tr>
                           <td align="center" valign="top">
                            <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td class="pc-w620-spacing-0-0-24-0" valign="top" style="padding: 0px 0px 24px 0px;">
                               <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                <tr>
                                 <td valign="top" class="pc-w620-padding-0-0-0-0" align="center" style="padding: 0px 0px 0px 0px;">
                                  <div class="pc-font-alt pc-w620-fontSize-14px" style="line-height: 150%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; font-variant-ligatures: normal; color: #121212cc; text-align: center; text-align-last: center;">
                                   <div><span style="font-weight: 400;font-style: normal;">The Hibuyshopping will commence work on this immediately. You&#39;ll receive an email notification once it&#39;s shipped. </span>
                                   </div>
                                  </div>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                          <tr>
                           <td align="center" valign="top">
                            <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td class="pc-w620-spacing-0-32-12-32 pc-w620-valign-middle pc-w620-halign-center" align="center" style="padding: 0px 0px 12px 0px;">
                               <table class="pc-width-hug pc-w620-gridCollapsed-0 pc-w620-width-hug pc-w620-halign-center" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr class="pc-grid-tr-first pc-grid-tr-last">
                                 <td class="pc-grid-td-first pc-w620-itemsSpacings-0-0" valign="middle" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 0px;">
                                  <table class="pc-w620-width-fill" style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td class="pc-w620-halign-center pc-w620-valign-middle" align="center" valign="middle">
                                     <table class="pc-w620-halign-center" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td class="pc-w620-halign-center" align="center" valign="top">
                                        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                         <tr>
                                          <td class="pc-w620-halign-center" align="center" valign="top" style="padding: 0px 0px 0px 0px;">
                                           <img src="https://cloudfilesdm.com/postcards/image-1702452390921.png" class="pc-w620-width-32 pc-w620-height-auto pc-w620-halign-center" width="40" height="40" alt="" style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 40px; height: auto; max-width: 100%; border: 0;" />
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-w620-itemsSpacings-0-0" valign="middle" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 0px;">
                                  <table class="pc-w620-width-fill" style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td class="pc-w620-halign-center pc-w620-valign-middle" align="left" valign="middle">
                                     <table class="pc-w620-halign-center" align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td class="pc-w620-halign-center" align="left" valign="top">
                                        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                         <tr>
                                          <td valign="top">
                                           <table class="pc-w620-width-64  pc-w620-halign-center" width="124" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin-right: auto;">
                                            <tr>
                                             <!--[if gte mso 9]>
                    <td height="1" valign="top" style="line-height: 1px; font-size: 1px; border-bottom: 1px solid #000000;">&nbsp;</td>
                <![endif]-->
                                             <!--[if !gte mso 9]><!-- -->
                                             <td height="1" valign="top" style="line-height: 1px; font-size: 1px; border-bottom: 1px solid #000000;">&nbsp;</td>
                                             <!--<![endif]-->
                                            </tr>
                                           </table>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-w620-itemsSpacings-0-0" valign="middle" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 0px;">
                                  <table class="pc-w620-width-fill" style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td align="center" valign="middle">
                                     <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="center" valign="top">
                                        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                         <tr>
                                          <td align="center" valign="top" style="padding: 0px 0px 0px 0px;">
                                           <img src="https://cloudfilesdm.com/postcards/image-1702463224472.png" class="pc-w620-width-32 pc-w620-height-auto" width="40" height="40" alt="" style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 40px; height: auto; max-width: 100%; border: 0;" />
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-w620-itemsSpacings-0-0" valign="middle" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 0px;">
                                  <table class="pc-w620-width-fill" style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td class="pc-w620-halign-center pc-w620-valign-middle" align="left" valign="top">
                                     <table class="pc-w620-halign-center" align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td class="pc-w620-halign-center" align="left" valign="top">
                                        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                         <tr>
                                          <td valign="top">
                                           <table class="pc-w620-width-64  pc-w620-halign-center" width="124" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin-right: auto;">
                                            <tr>
                                             <!--[if gte mso 9]>
                    <td height="1" valign="top" style="line-height: 1px; font-size: 1px; border-bottom: 1px solid #000000;">&nbsp;</td>
                <![endif]-->
                                             <!--[if !gte mso 9]><!-- -->
                                             <td height="1" valign="top" style="line-height: 1px; font-size: 1px; border-bottom: 1px solid #000000;">&nbsp;</td>
                                             <!--<![endif]-->
                                            </tr>
                                           </table>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-grid-td-last pc-w620-itemsSpacings-0-0" valign="middle" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 0px;">
                                  <table class="pc-w620-width-fill" style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td class="pc-w620-halign-center pc-w620-valign-middle" align="center" valign="middle">
                                     <table class="pc-w620-halign-center" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td class="pc-w620-halign-center" align="center" valign="top">
                                        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                         <tr>
                                          <td class="pc-w620-halign-center" align="center" valign="top" style="padding: 0px 0px 0px 0px;">
                                           <img src="https://cloudfilesdm.com/postcards/image-1702463242847.png" class="pc-w620-width-32 pc-w620-height-auto pc-w620-halign-center" width="40" height="40" alt="" style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 40px; height: auto; max-width: 100%; border: 0;" />
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                          <tr>
                           <td align="center" valign="top">
                            <table class="pc-w620-width-fill" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td class="pc-w620-spacing-0-0-24-0 pc-w620-valign-top pc-w620-halign-center" style="padding: 0px 0px 24px 0px;">
                               <table class="pc-width-fill pc-w620-gridCollapsed-0 pc-w620-width-fill pc-w620-halign-center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr class="pc-grid-tr-first pc-grid-tr-last">
                                 <td class="pc-grid-td-first pc-w620-itemsSpacings-0-0" align="center" valign="top" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 0px;">
                                  <table class="pc-w620-width-fill pc-w620-halign-center" style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td align="center" valign="middle">
                                     <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="center" valign="top">
                                        <table class="pc-w620-width-80" width="80" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                         <tr>
                                          <td valign="top" style="padding: 0px 0px 0px 0px;">
                                           <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" align="center" style="border-collapse: separate; border-spacing: 0;">
                                            <tr>
                                             <td valign="top" class="pc-w620-align-center" align="center" style="padding: 0px 0px 0px 0px;">
                                              <div class="pc-font-alt pc-w620-align-center pc-w620-fontSize-14px" style="line-height: 120%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; font-variant-ligatures: normal; color: #121212cc; text-align: center; text-align-last: center;">
                                               <div><span style="font-weight: 400;font-style: normal;">Order Confirmed</span>
                                               </div>
                                              </div>
                                             </td>
                                            </tr>
                                           </table>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-w620-itemsSpacings-0-0" align="center" valign="top" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 0px;">
                                  <table class="pc-w620-width-fill pc-w620-halign-center" style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td align="center" valign="middle">
                                     <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="center" valign="top">
                                        <table class="pc-w620-width-80" width="80" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                         <tr>
                                          <td valign="top" style="padding: 0px 0px 0px 0px;">
                                           <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" align="center" style="border-collapse: separate; border-spacing: 0;">
                                            <tr>
                                             <td valign="top" align="center" style="padding: 0px 0px 0px 0px;">
                                              <div class="pc-font-alt pc-w620-fontSize-14px" style="line-height: 120%; letter-spacing: 0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; font-variant-ligatures: normal; color: #121212cc; text-align: center; text-align-last: center;">
                                               <div><span style="font-weight: 400;font-style: normal;">Shipped</span>
                                               </div>
                                              </div>
                                             </td>
                                            </tr>
                                           </table>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-grid-td-last pc-w620-itemsSpacings-0-0" align="center" valign="top" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 0px;">
                                  <table class="pc-w620-width-fill pc-w620-halign-center" style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td align="center" valign="middle">
                                     <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="center" valign="top">
                                        <table class="pc-w620-width-80" width="80" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                         <tr>
                                          <td valign="top" style="padding: 0px 0px 0px 0px;">
                                           <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" align="center" style="border-collapse: separate; border-spacing: 0;">
                                            <tr>
                                             <td valign="top" class="pc-w620-align-center" align="center" style="padding: 0px 0px 0px 0px;">
                                              <div class="pc-font-alt pc-w620-align-center pc-w620-fontSize-14px" style="line-height: 120%; letter-spacing: 0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; font-variant-ligatures: normal; color: #121212cc; text-align: center; text-align-last: center;">
                                               <div><span style="font-weight: 400;font-style: normal;">Expected</span>
                                               </div>
                                               <div><span style="font-weight: 400;font-style: normal;">Delivered</span>
                                               </div>
                                              </div>
                                             </td>
                                            </tr>
                                           </table>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                          <tr>
                           <td align="center" valign="top">
                            <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td align="center">
                               <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                 <td valign="top">
                                  <table class="pc-width-hug pc-w620-gridCollapsed-1" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr class="pc-grid-tr-first pc-grid-tr-last">
                                    <td class="pc-grid-td-first pc-grid-td-last pc-w620-itemsSpacings-0-30" valign="middle" style="width: 50%; padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 0px;">
                                     <table style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                       <td align="center" valign="top">
                                        <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                         <tr>
                                          <td align="center" valign="top">
                                           <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                            <tr>
                                             <th valign="top" align="center" style="padding: 0px 0px 24px 0px; text-align: center; font-weight: normal; line-height: 1;">
                                              <!--[if mso]>
        <table border="0" cellpadding="0" cellspacing="0" role="presentation" class="pc-w620-width-100pc" align="center" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
            <tr>
                <td valign="middle" align="center" style="border-radius: 500px 500px 500px 500px; background-color: #ff554a; text-align:center; color: #ffffff; padding: 12px 24px 12px 24px; mso-padding-left-alt: 0; margin-left:24px;" bgcolor="#ff554a">
                                    <a class="pc-font-alt" style="display: inline-block; text-decoration: none; font-variant-ligatures: normal; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-weight: bold; font-size: 16px; line-height: 24px; letter-spacing: -0px; text-align: center; color: #ffffff;" href="https://designmodo.com/postcards" target="_blank"><span style="display: block;"><span>View Your Order</span></span></a>
                                </td>
            </tr>
        </table>
        <![endif]-->
                                              <!--[if !mso]><!-- -->
                                              <a class="pc-w620-width-100pc" style="display: inline-block; box-sizing: border-box; border-radius: 500px 500px 500px 500px; background-color: #ff554a; padding: 12px 24px 12px 24px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-weight: bold; font-size: 16px; line-height: 24px; letter-spacing: -0px; color: #ffffff; vertical-align: top; text-align: center; text-align-last: center; text-decoration: none; -webkit-text-size-adjust: none;" href="https://hibuyshopping.com/user/orders" target="_blank"><span style="display: block;"><span>View Your Order</span></span></a>
                                              <!--<![endif]-->
                                             </th>
                                            </tr>
                                           </table>
                                          </td>
                                         </tr>
                                         <tr>
                                          <td align="center" valign="top">
                                           <table width="100%" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                            <tr>
                                             <td valign="top">
                                              <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" align="center" style="border-collapse: separate; border-spacing: 0;">
                                               <tr>
                                                <td valign="top" align="center">
                                                 <div class="pc-font-alt pc-w620-fontSize-14px" style="line-height: 150%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; font-variant-ligatures: normal; color: #121212cc; text-align: center; text-align-last: center;">
                                                  <div><span style="font-weight: 400;font-style: normal;">Estimated delivery times. Reach out to the seller for any order concerns. Additional information is accessible. </span>
                                                  </div>
                                                 </div>
                                                </td>
                                               </tr>
                                              </table>
                                             </td>
                                            </tr>
                                           </table>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                         </table>
                        </td>
                       </tr>
                      </table>
                     </td>
                    </tr>
                   </table>
                  </td>
                 </tr>
                </table>
               </td>
              </tr>
             </table>
            </td>
           </tr>
          </table>
          <!-- END MODULE: Order Status -->
         </td>
        </tr>
        <tr>
         <td valign="top">
          <!-- BEGIN MODULE: Order Details -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
           <tr>
            <td class="pc-w620-spacing-0-0-0-0" style="padding: 0px 0px 0px 0px;">
             <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
              <tr>
               <td valign="top" class="pc-w620-padding-40-24-0-24" style="padding: 48px 32px 0px 32px; border-radius: 0px; background-color: #ffffff;" bgcolor="#ffffff">
                <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                 <tr>
                  <td class="pc-w620-spacing-0-0-4-0" align="center" valign="top" style="padding: 0px 0px 8px 0px;">
                   <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
                    <tr>
                     <td valign="top" class="pc-w620-padding-0-0-0-0" align="center" style="padding: 0px 0px 0px 0px;">
                      <div class="pc-font-alt pc-w620-fontSize-32px pc-w620-lineHeight-40" style="line-height: 120%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 32px; font-weight: bold; font-variant-ligatures: normal; color: #121212; text-align: center; text-align-last: center;">
                       <div><span>Order details</span>
                       </div>
                      </div>
                     </td>
                    </tr>
                   </table>
                  </td>
                 </tr>
                </table>
                <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                    ${cartItems
                        .flatMap((shop) =>
                          shop.items.map(
                            (item) => `
                            <tr>
                                <td align="center" valign="top" style="padding: 0px 0px 24px 0px;">
                                 <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
                                  <tr>
                                   <td valign="top" align="center" style="padding: 0px 0px 0px 0px;">
                                    <div class="pc-font-alt pc-w620-fontSize-16px pc-w620-lineHeight-120pc" style="line-height: 150%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 600; font-variant-ligatures: normal; color: #000000; text-align: center; text-align-last: center;">
                                     <div><span style="color: rgb(18, 18, 18);">Confirmation number:</span><span style="color: rgba(6, 1, 21, 0.6);"> </span><span style="color: rgb(255, 85, 74);">#${item.id}</span>
                                     </div>
                                    </div>
                                   </td>
                                  </tr>
                                 </table>
                                </td>
                               </tr>
                     `
                          )
                        )
                        .join("")}
                
                </table>
                <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                 <tr>
                  <td style="padding: 0px 0px 0px 0px; ">
                   <table class="pc-w620-width-fill pc-w620-tableCollapsed-0" border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0; width: 100%; border-top: 1px solid #d1dfe3; border-right: 1px solid #d1dfe3; border-bottom: 1px solid #d1dfe3; border-left: 1px solid #d1dfe3; border-radius: 12px 12px 12px 12px;">
                   
                    ${cartItems
                        .flatMap((shop) =>
                          shop.items.map(
                            (item) => `
                            <tbody>
                                <tr>
                                 <td class="pc-w620-halign-left pc-w620-valign-middle pc-w620-padding-20-0-20-20 pc-w620-width-100pc" align="left" valign="middle" style="padding: 20px 0px 20px 20px; border-bottom: 1px solid #d1dfe3;">
                                  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td class="pc-w620-spacing-0-0-12-0 pc-w620-align-left" valign="top" style="padding: 0px 20px 12px 0px;">
                                     <img src=${item.image} class="pc-w620-align-left" width="102" height="102" alt=${item.name} style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 102px; height: auto; max-width: 100%; border-radius: 6px 6px 6px 6px; border: 0;" />
                                    </td>
                                   </tr>
                                  </table>
                                  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td class="pc-w620-align-left" align="left" valign="top" style="padding: 0px 0px 2px 0px;">
                                     <table border="0" cellpadding="0" cellspacing="0" role="presentation" class="pc-w620-align-left" width="100%" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
                                      <tr>
                                       <td valign="top" class="pc-w620-align-left" align="left" style="padding: 0px 0px 0px 0px;">
                                        <!-- <div class="pc-font-alt pc-w620-align-left pc-w620-fontSize-14px pc-w620-lineHeight-24" style="line-height: 24px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212cc; text-align: left; text-align-last: left;">
                                         <div><span>Transaction ID: 1806790905</span>
                                         </div>
                                        </div> -->
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td class="pc-w620-align-left" align="left" valign="top" style="padding: 0px 0px 2px 0px;">
                                     <table border="0" cellpadding="0" cellspacing="0" role="presentation" class="pc-w620-align-left" width="100%" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
                                      <tr>
                                       <td valign="top" class="pc-w620-align-left" align="left">
                                        <div class="pc-font-alt pc-w620-align-left" style="line-height: 24px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212cc; text-align: left; text-align-last: left;">
                                         <div><span>Size: ${item.size || "None"}</span>
                                         </div>
                                        </div>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td class="pc-w620-align-left" align="left" valign="top" style="padding: 0px 0px 2px 0px;">
                                     <table border="0" cellpadding="0" cellspacing="0" role="presentation" class="pc-w620-align-left" width="100%" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
                                      <tr>
                                       <td valign="top" class="pc-w620-align-left" align="left" style="padding: 0px 0px 0px 0px;">
                                        <div class="pc-font-alt pc-w620-align-left" style="line-height: 24px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212cc; text-align: left; text-align-last: left;">
                                         <div><span>Color : ${item.color} </span>
                                         </div>
                                        </div>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                  <table border="0" cellpadding="0" cellspacing="0" role="presentation" class="pc-w620-align-left" width="100%" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
                                   <tr>
                                    <td valign="top" class="pc-w620-align-left" align="left">
                                     <div class="pc-font-alt pc-w620-align-left" style="line-height: 24px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212cc; text-align: left; text-align-last: left;">
                                      <div><span>Quantity: ${item.quantity}</span>
                                      </div>
                                     </div>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-w620-halign-right pc-w620-valign-bottom pc-w620-padding-20-20-20-0 pc-w620-width-100pc" align="right" valign="bottom" style="padding: 0px 20px 20px 0px; border-bottom: 1px solid #d1dfe3;">
                                  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td class="pc-w620-spacing-0-0-0-0 pc-w620-align-right" align="right" valign="top">
                                     <table border="0" cellpadding="0" cellspacing="0" role="presentation" class="pc-w620-align-right" width="100%" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
                                      <tr>
                                       <td valign="top" class="pc-w620-padding-0-0-0-0 pc-w620-align-right" align="right">
                                        <div class="pc-font-alt pc-w620-align-right pc-w620-fontSize-14px pc-w620-lineHeight-22" style="line-height: 22px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 800; font-variant-ligatures: normal; color: #121212; text-align: right; text-align-last: right;">
                                         <div><span>${item.subtotal} PKR</span>
                                         </div>
                                        </div>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                </tr>
                                <tr>
                                 <td class="pc-w620-halign-left pc-w620-valign-middle pc-w620-padding-20-0-20-20 pc-w620-width-100pc" align="left" valign="top" style="padding: 20px 0px 20px 20px; border-bottom: 1px solid #d1dfe3;">
                                  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td>
                                     <table class="pc-width-fill pc-w620-gridCollapsed-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr class="pc-grid-tr-first pc-grid-tr-last">
                                       <td class="pc-grid-td-first pc-w620-itemsSpacings-0-30" align="left" valign="top" style="width: 50%; padding-top: 0px; padding-right: 20px; padding-bottom: 0px; padding-left: 0px;">
                                        <table style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                         <tr>
                                          <td align="left" valign="top">
                                           <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                            <tr>
                                             <td align="left" valign="top">
                                              <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                               <tr>
                                                <td class="pc-w620-spacing-0-0-8-0" valign="top" style="padding: 0px 0px 8px 0px;">
                                                 <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                                  <tr>
                                                   <td valign="top" class="pc-w620-padding-0-0-0-0 pc-w620-align-left" align="left" style="padding: 0px 0px 0px 0px;">
                                                    <div class="pc-font-alt pc-w620-align-left pc-w620-fontSize-16 pc-w620-lineHeight-26" style="line-height: 24px; letter-spacing: 0px; font-family: 'Nunito', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: bold; font-variant-ligatures: normal; color: #121212; text-align: left; text-align-last: left;">
                                                     <div><span>Shipping address</span>
                                                     </div>
                                                    </div>
                                                   </td>
                                                  </tr>
                                                 </table>
                                                </td>
                                               </tr>
                                              </table>
                                             </td>
                                            </tr>
                                            <tr>
                                             <td align="left" valign="top">
                                              <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                               <tr>
                                                <td valign="top" style="padding: 0px 0px 2px 0px;">
                                                 <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                                  <tr>
                                                   <td valign="top" class="pc-w620-align-left" align="left">
                                                    <div class="pc-font-alt pc-w620-align-left" style="line-height: 24px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212cc; text-align: left; text-align-last: left;">
                                                     <div><span>${streetAddressLine1}</span>
                                                     </div>
                                                    </div>
                                                   </td>
                                                  </tr>
                                                 </table>
                                                </td>
                                               </tr>
                                              </table>
                                             </td>
                                            </tr>
                                            <tr>
                                             <td align="left" valign="top">
                                              <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                               <tr>
                                                <td valign="top" style="padding: 0px 0px 2px 0px;">
                                                 <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                                  <tr>
                                                   <td valign="top" class="pc-w620-align-left" align="left">
                                                    <div class="pc-font-alt pc-w620-align-left" style="line-height: 24px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212cc; text-align: left; text-align-last: left;">
                                                     <div><span>${city}</span>
                                                     </div>
                                                    </div>
                                                   </td>
                                                  </tr>
                                                 </table>
                                                </td>
                                               </tr>
                                              </table>
                                             </td>
                                            </tr>
                                            <tr>
                                             <td align="left" valign="top">
                                              <table width="100%" align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                               <tr>
                                                <td valign="top" style="padding: 0px 0px 2px 0px;">
                                                 <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" align="left" style="border-collapse: separate; border-spacing: 0;">
                                                  <tr>
                                                   <td valign="top" class="pc-w620-align-left" align="left" style="padding: 0px 0px 0px 0px;">
                                                    <div class="pc-font-alt pc-w620-align-left" style="line-height: 24px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212cc; text-align: left; text-align-last: left;">
                                                     <div><span>${zipCode}</span>
                                                     </div>
                                                    </div>
                                                   </td>
                                                  </tr>
                                                 </table>
                                                </td>
                                               </tr>
                                              </table>
                                             </td>
                                            </tr>
                                            <tr>
                                             <td align="left" valign="top">
                                              <table width="100%" align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                               <tr>
                                                <td valign="top">
                                                 <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" align="left" style="border-collapse: separate; border-spacing: 0;">
                                                  <tr>
                                                   <td valign="top" class="pc-w620-align-left" align="left">
                                                    <div class="pc-font-alt pc-w620-align-left" style="line-height: 20px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212cc; text-align: left; text-align-last: left;">
                                                     <div><span>${state}</span>
                                                     </div>
                                                    </div>
                                                   </td>
                                                  </tr>
                                                 </table>
                                                </td>
                                               </tr>
                                              </table>
                                             </td>
                                            </tr>
                                           </table>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                       <td class="pc-grid-td-last pc-w620-itemsSpacings-0-30" align="left" valign="top" style="width: 50%; padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 20px;">
                                        <table style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                         <tr>
                                          <td align="left" valign="top">
                                           <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                            <tr>
                                             <td align="left" valign="top">
                                              <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                               <tr>
                                                <td class="pc-w620-spacing-0-0-8-0" valign="top" style="padding: 0px 0px 8px 0px;">
                                                 <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                                  <tr>
                                                   <td valign="top" class="pc-w620-padding-0-0-0-0 pc-w620-align-left" align="left" style="padding: 0px 0px 0px 0px;">
                                                    <div class="pc-font-alt pc-w620-align-left pc-w620-fontSize-16 pc-w620-lineHeight-26" style="line-height: 24px; letter-spacing: 0px; font-family: 'Nunito', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: bold; font-variant-ligatures: normal; color: #121212; text-align: left; text-align-last: left;">
                                                     <div><span>Paid with Credit card</span>
                                                     </div>
                                                    </div>
                                                   </td>
                                                  </tr>
                                                 </table>
                                                </td>
                                               </tr>
                                              </table>
                                             </td>
                                            </tr>
                                            <tr>
                                             <td align="left" valign="top">
                                              <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                               <tr>
                                                <td valign="top" style="padding: 0px 0px 2px 0px;">
                                                 <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                                  <tr>
                                                   <td valign="top" class="pc-w620-align-left" align="left">
                                                    <div class="pc-font-alt pc-w620-align-left" style="line-height: 24px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212cc; text-align: left; text-align-last: left;">
                                                     <div><span>Subtotal</span>
                                                     </div>
                                                    </div>
                                                   </td>
                                                  </tr>
                                                 </table>
                                                </td>
                                               </tr>
                                              </table>
                                             </td>
                                            </tr>
                                            <tr>
                                             <td align="left" valign="top">
                                              <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                               <tr>
                                                <td valign="top" style="padding: 0px 0px 2px 0px;">
                                                 <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                                  <tr>
                                                   <td valign="top" class="pc-w620-align-left" align="left">
                                                    <div class="pc-font-alt pc-w620-align-left" style="line-height: 24px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212cc; text-align: left; text-align-last: left;">
                                                     <div><span>Sales tax</span>
                                                     </div>
                                                    </div>
                                                   </td>
                                                  </tr>
                                                 </table>
                                                </td>
                                               </tr>
                                              </table>
                                             </td>
                                            </tr>
                                            <tr>
                                             <td align="left" valign="top">
                                              <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                               <tr>
                                                <td valign="top" style="padding: 0px 0px 2px 0px;">
                                                 <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                                  <tr>
                                                   <td valign="top" class="pc-w620-align-left" align="left" style="padding: 0px 0px 0px 0px;">
                                                    <div class="pc-font-alt pc-w620-align-left pc-w620-lineHeight-24" style="line-height: 24px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212cc; text-align: left; text-align-last: left;">
                                                     <div><span>Shipping</span>
                                                     </div>
                                                    </div>
                                                   </td>
                                                  </tr>
                                                 </table>
                                                </td>
                                               </tr>
                                              </table>
                                             </td>
                                            </tr>
                                            <tr>
                                             <td align="left" valign="top">
                                              <table width="100%" align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                               <tr>
                                                <td valign="top">
                                                 <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" align="left" style="border-collapse: separate; border-spacing: 0;">
                                                  <tr>
                                                   <td valign="top" class="pc-w620-align-left" align="left">
                                                    <div class="pc-font-alt pc-w620-align-left" style="line-height: 20px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212cc; text-align: left; text-align-last: left;">
                                                     <div><span>Discount</span>
                                                     </div>
                                                    </div>
                                                   </td>
                                                  </tr>
                                                 </table>
                                                </td>
                                               </tr>
                                              </table>
                                             </td>
                                            </tr>
                                           </table>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-w620-halign-right pc-w620-valign-bottom pc-w620-padding-20-20-20-0 pc-w620-width-100pc" align="right" valign="bottom" style="padding: 0px 20px 20px 0px; border-bottom: 1px solid #d1dfe3;">
                                  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td class="pc-w620-spacing-174-0-0-40" valign="top" style="padding: 0px 0px 0px 0px;">
                                     <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                       <td class="pc-w620-padding-0-0-0-0 pc-w620-align-right" valign="top" align="right" style="padding: 0px 0px 0px 0px;">
                                        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                         <tr>
                                          <th class="pc-w620-align-right" align="right" valign="top" style="font-weight: normal; text-align: left; padding: 0px 0px 2px 0px;">
                                           <table border="0" cellpadding="0" cellspacing="0" role="presentation" class="pc-w620-align-right" width="100%" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
                                            <tr>
                                             <td valign="top" class="pc-w620-align-right" align="right" style="padding: 0px 0px 0px 0px;">
                                              <div class="pc-font-alt pc-w620-align-right" style="line-height: 24px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 800; font-variant-ligatures: normal; color: #121212; text-align: right; text-align-last: right;">
                                               <div><span>${item.subtotal}</span>
                                               </div>
                                              </div>
                                             </td>
                                            </tr>
                                           </table>
                                          </th>
                                         </tr>
                                         <tr>
                                          <th class="pc-w620-align-right" align="right" valign="top" style="font-weight: normal; text-align: left; padding: 0px 0px 2px 0px;">
                                           <table border="0" cellpadding="0" cellspacing="0" role="presentation" class="pc-w620-align-right" width="100%" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
                                            <tr>
                                             <td valign="top" class="pc-w620-align-right" align="right" style="padding: 0px 0px 0px 0px;">
                                              <div class="pc-font-alt pc-w620-align-right" style="line-height: 24px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212; text-align: right; text-align-last: right;">
                                               <div><span>200</span>
                                               </div>
                                              </div>
                                             </td>
                                            </tr>
                                           </table>
                                          </th>
                                         </tr>
                                         <tr>
                                          <th class="pc-w620-spacing-0-0-0-0 pc-w620-align-right" align="right" valign="top" style="font-weight: normal; text-align: left; padding: 0px 0px 2px 0px;">
                                           <table border="0" cellpadding="0" cellspacing="0" role="presentation" class="pc-w620-align-right" width="100%" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
                                            <tr>
                                             <td valign="top" class="pc-w620-padding-0-0-0-0 pc-w620-align-right" align="right" style="padding: 0px 0px 0px 0px;">
                                              <div class="pc-font-alt pc-w620-align-right" style="line-height: 24px; letter-spacing: 0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; font-variant-ligatures: normal; color: #121212; text-align: right; text-align-last: right;">
                                               <div><span>-${discountAmount || 0}</span>
                                               </div>
                                              </div>
                                             </td>
                                            </tr>
                                           </table>
                                          </th>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                </tr>
                                <tr align="left" valign="middle">
                                 <td class="pc-w620-halign-left pc-w620-valign-middle pc-w620-padding-20-0-20-20 pc-w620-width-100pc" align="left" valign="middle" style="padding: 20px 0px 20px 20px;">
                                  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td class="pc-w620-spacing-0-0-0-0 pc-w620-align-left" align="left" valign="top">
                                     <table border="0" cellpadding="0" cellspacing="0" role="presentation" class="pc-w620-align-left" width="100%" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
                                      <tr>
                                       <td valign="top" class="pc-w620-padding-0-0-0-0 pc-w620-align-left" align="left">
                                        <div class="pc-font-alt pc-w620-align-left pc-w620-fontSize-16 pc-w620-lineHeight-20" style="line-height: 22px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: bold; font-variant-ligatures: normal; color: #121212; text-align: left; text-align-last: left;">
                                         <div><span>Total (1 item)</span>
                                         </div>
                                        </div>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-w620-halign-right pc-w620-valign-bottom pc-w620-padding-20-20-20-0 pc-w620-width-100pc" align="right" valign="middle" style="padding: 20px 20px 20px 20px;">
                                  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td class="pc-w620-spacing-0-0-0-0 pc-w620-align-right" align="right" valign="top">
                                     <table border="0" cellpadding="0" cellspacing="0" role="presentation" class="pc-w620-align-right" width="100%" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
                                      <tr>
                                       <td valign="top" class="pc-w620-padding-0-0-0-0 pc-w620-align-right" align="right">
                                        <div class="pc-font-alt pc-w620-align-right pc-w620-fontSize-16px pc-w620-lineHeight-20" style="line-height: 22px; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 20px; font-weight: 800; font-variant-ligatures: normal; color: #121212; text-align: right; text-align-last: right;">
                                         <div><span>${orderTotalAmount}</span>
                                         </div>
                                        </div>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                </tr>
                               </tbody>
                     `
                          )
                        )
                        .join("")}
                    
                   </table>
                  </td>
                 </tr>
                </table>
               </td>
              </tr>
             </table>
            </td>
           </tr>
          </table>
          <!-- END MODULE: Order Details -->
         </td>
        </tr>
        <tr>
         <td valign="top">
          <!-- BEGIN MODULE: Support -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
           <tr>
            <td class="pc-w620-spacing-0-0-0-0" style="padding: 0px 0px 0px 0px;">
             <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
              <tr>
               <td valign="top" class="pc-w620-padding-40-24-32-24" style="padding: 48px 32px 48px 32px; border-radius: 0px; background-color: #ffffff;" bgcolor="#ffffff">
                <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                 <tr>
                  <td>
                   <table class="pc-width-fill pc-w620-gridCollapsed-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                    <tr class="pc-grid-tr-first">
                     <td class="pc-grid-td-first pc-w620-itemsSpacings-0-16" align="left" valign="top" style="width: 50%; padding-top: 0px; padding-right: 7px; padding-bottom: 7px; padding-left: 0px;">
                      <table style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                       <tr>
                        <td align="left" valign="top" style="padding: 16px 16px 16px 16px; background-color: #fff8f0; border-radius: 12px 12px 12px 12px;">
                         <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                          <tr>
                           <td align="left" valign="top">
                            <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td align="left" style="padding: 0px 0px 0px 0px;">
                               <table class="pc-width-hug pc-w620-gridCollapsed-0" align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr class="pc-grid-tr-first pc-grid-tr-last">
                                 <td class="pc-grid-td-first" valign="middle" style="padding-top: 0px; padding-right: 2px; padding-bottom: 0px; padding-left: 0px;">
                                  <table style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td align="left" valign="top">
                                     <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="left" valign="top">
                                        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                         <tr>
                                          <td align="left" valign="top">
                                           <img src="https://cloudfilesdm.com/postcards/image-1702452891578.png" width="40" height="40" alt="" style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 40px; height: 40px; border: 0;" />
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-grid-td-last" valign="middle" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 2px;">
                                  <table style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td align="left" valign="top">
                                     <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="left" valign="top">
                                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" align="left" style="border-collapse: separate; border-spacing: 0;">
                                         <tr>
                                          <td valign="top" align="left">
                                           <div class="pc-font-alt" style="line-height: 120%; letter-spacing: 0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 20px; font-weight: bold; font-variant-ligatures: normal; color: #1b1b1b; text-align: left; text-align-last: left;">
                                            <div><span>Chat With Us</span>
                                            </div>
                                           </div>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                          <tr>
                           <td align="left" valign="top">
                            <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td valign="top" style="padding: 0px 0px 0px 44px;">
                               <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                <tr>
                                 <td valign="top" align="left" style="padding: 0px 0px 0px 0px;">
                                  <div class="pc-font-alt" style="line-height: 143%; letter-spacing: -0.2px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: normal; font-variant-ligatures: normal; color: #060115; text-align: left; text-align-last: left;">
                                   <div><span>Go to hibuyshopping.com/chat</span>
                                   </div>
                                  </div>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                         </table>
                        </td>
                       </tr>
                      </table>
                     </td>
                     <td class="pc-grid-td-last pc-w620-itemsSpacings-0-16" align="left" valign="top" style="width: 50%; padding-top: 0px; padding-right: 0px; padding-bottom: 7px; padding-left: 7px;">
                      <table style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                       <tr>
                        <td align="left" valign="top" style="padding: 16px 16px 16px 16px; background-color: #fff8f0; border-radius: 12px 12px 12px 12px;">
                         <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                          <tr>
                           <td align="left" valign="top">
                            <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td align="left" style="padding: 0px 0px 0px 0px;">
                               <table class="pc-width-hug pc-w620-gridCollapsed-0" align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr class="pc-grid-tr-first pc-grid-tr-last">
                                 <td class="pc-grid-td-first" valign="middle" style="padding-top: 0px; padding-right: 2px; padding-bottom: 0px; padding-left: 0px;">
                                  <table style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td align="left" valign="top">
                                     <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="left" valign="top">
                                        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                         <tr>
                                          <td align="left" valign="top">
                                           <img src="https://cloudfilesdm.com/postcards/image-1702454461214.png" width="40" height="40" alt="" style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 40px; height: 40px; border: 0;" />
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-grid-td-last" valign="middle" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 2px;">
                                  <table style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td align="left" valign="top">
                                     <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="left" valign="top">
                                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" align="left" style="border-collapse: separate; border-spacing: 0;">
                                         <tr>
                                          <td valign="top" align="left">
                                           <div class="pc-font-alt" style="line-height: 120%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 20px; font-weight: bold; font-variant-ligatures: normal; color: #060115; text-align: left; text-align-last: left;">
                                            <div><span>Call Us</span>
                                            </div>
                                           </div>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                          <tr>
                           <td align="left" valign="top">
                            <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td valign="top" style="padding: 0px 0px 0px 44px;">
                               <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                <tr>
                                 <td valign="top" align="left" style="padding: 0px 0px 0px 0px;">
                                  <div class="pc-font-alt" style="line-height: 143%; letter-spacing: -0.2px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: normal; font-variant-ligatures: normal; color: #2a2020; text-align: left; text-align-last: left;">
                                   <div><span>+92 319-6379089</span>
                                   </div>
                                  </div>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                         </table>
                        </td>
                       </tr>
                      </table>
                     </td>
                    </tr>
                    <tr class="pc-grid-tr-last">
                     <td class="pc-grid-td-first pc-w620-itemsSpacings-0-16" align="left" valign="top" style="width: 50%; padding-top: 7px; padding-right: 7px; padding-bottom: 0px; padding-left: 0px;">
                      <table style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                       <tr>
                        <td align="left" valign="top" style="padding: 16px 16px 16px 16px; background-color: #fff8f0; border-radius: 12px 12px 12px 12px;">
                         <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                          <tr>
                           <td align="left" valign="top">
                            <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td align="center" style="padding: 0px 0px 0px 0px;">
                               <table class="pc-width-hug pc-w620-gridCollapsed-0" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr class="pc-grid-tr-first pc-grid-tr-last">
                                 <td class="pc-grid-td-first" valign="middle" style="padding-top: 0px; padding-right: 2px; padding-bottom: 0px; padding-left: 0px;">
                                  <table style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td align="left" valign="top">
                                     <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="left" valign="top">
                                        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                         <tr>
                                          <td align="left" valign="top">
                                           <img src="https://cloudfilesdm.com/postcards/image-1702454769795.png" width="40" height="40" alt="" style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 40px; height: 40px; border: 0;" />
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-grid-td-last" valign="middle" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 2px;">
                                  <table style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td align="left" valign="top">
                                     <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="left" valign="top">
                                        <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                         <tr>
                                          <td valign="top" style="padding: 0px 0px 0px 0px;">
                                           <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                            <tr>
                                             <td valign="top" align="left" style="padding: 0px 0px 0px 0px;">
                                              <div class="pc-font-alt" style="line-height: 120%; letter-spacing: -0.2px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 20px; font-weight: bold; font-variant-ligatures: normal; color: #1b1b1b; text-align: left; text-align-last: left;">
                                               <div><span>Email Us</span>
                                               </div>
                                              </div>
                                             </td>
                                            </tr>
                                           </table>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                          <tr>
                           <td align="left" valign="top">
                            <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td valign="top" style="padding: 0px 0px 0px 44px;">
                               <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                <tr>
                                 <td valign="top" align="left" style="padding: 0px 0px 0px 0px;">
                                  <div class="pc-font-alt" style="line-height: 143%; letter-spacing: -0.2px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: normal; font-variant-ligatures: normal; color: #060115; text-align: left; text-align-last: left;">
                                   <div><span>hibuyshoppingofficial@gmail.com</span>
                                   </div>
                                  </div>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                         </table>
                        </td>
                       </tr>
                      </table>
                     </td>
                     <td class="pc-grid-td-last pc-w620-itemsSpacings-0-16" align="left" valign="top" style="width: 50%; padding-top: 7px; padding-right: 0px; padding-bottom: 0px; padding-left: 7px;">
                      <table style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                       <tr>
                        <td align="left" valign="top" style="padding: 16px 16px 16px 16px; background-color: #fff8f0; border-radius: 12px 12px 12px 12px;">
                         <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                          <tr>
                           <td align="left" valign="top">
                            <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td align="left" style="padding: 0px 0px 0px 0px;">
                               <table class="pc-width-hug pc-w620-gridCollapsed-0" align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr class="pc-grid-tr-first pc-grid-tr-last">
                                 <td class="pc-grid-td-first" valign="middle" style="padding-top: 0px; padding-right: 2px; padding-bottom: 0px; padding-left: 0px;">
                                  <table style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td align="left" valign="top">
                                     <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="left" valign="top">
                                        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                         <tr>
                                          <td align="left" valign="top">
                                           <img src="https://cloudfilesdm.com/postcards/image-1702454809686.png" width="40" height="40" alt="" style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 40px; height: 40px; border: 0;" />
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-grid-td-last" valign="middle" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 2px;">
                                  <table style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td align="left" valign="top">
                                     <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="left" valign="top">
                                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" align="left" style="border-collapse: separate; border-spacing: 0;">
                                         <tr>
                                          <td valign="top" align="left">
                                           <div class="pc-font-alt" style="line-height: 120%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 20px; font-weight: bold; font-variant-ligatures: normal; color: #1b1b1b; text-align: left; text-align-last: left;">
                                            <div><span>Text Us</span>
                                            </div>
                                           </div>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                          <tr>
                           <td align="left" valign="top">
                            <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td valign="top" style="padding: 0px 0px 0px 44px;">
                               <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                <tr>
                                 <td valign="top" align="left" style="padding: 0px 0px 0px 0px;">
                                  <div class="pc-font-alt" style="line-height: 143%; letter-spacing: -0.2px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: normal; font-variant-ligatures: normal; color: #060115; text-align: left; text-align-last: left;">
                                   <div><span>+92 319-6379089</span>
                                   </div>
                                  </div>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                         </table>
                        </td>
                       </tr>
                      </table>
                     </td>
                    </tr>
                   </table>
                  </td>
                 </tr>
                </table>
               </td>
              </tr>
             </table>
            </td>
           </tr>
          </table>
          <!-- END MODULE: Support -->
         </td>
        </tr>
        <tr>
         <td valign="top">
          <!-- BEGIN MODULE: FAQ -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
           <tr>
            <td class="pc-w620-spacing-0-0-0-0" style="padding: 0px 0px 0px 0px;">
             <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
              <tr>
               <td valign="top" class="pc-w620-padding-0-0-0-0" style="padding: 0px 0px 0px 0px; border-radius: 0px; background-color: #ffffff;" bgcolor="#ffffff">
                <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                 <tr>
                  <td>
                   <table class="pc-width-fill pc-w620-gridCollapsed-0" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                    <tr class="pc-grid-tr-first pc-grid-tr-last">
                     <td class="pc-grid-td-first pc-grid-td-last" align="center" valign="top" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 0px;">
                      <table style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                       <tr>
                        <td class="pc-w620-padding-32-0-0-0" align="left" valign="middle" style="padding: 60px 0px 0px 40px; background-color: #feddb6;">
                         <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                          <tr>
                           <td align="left" valign="top">
                            <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td class="pc-w620-spacing-0-24-10-24" valign="top" style="padding: 0px 0px 20px 0px;">
                               <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                <tr>
                                 <td valign="top" class="pc-w620-padding-0-0-0-0" align="left" style="padding: 0px 0px 0px 0px;">
                                  <div class="pc-font-alt pc-w620-fontSize-32px pc-w620-lineHeight-120pc" style="line-height: 128%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 32px; font-weight: bold; font-variant-ligatures: normal; color: #060115; text-align: left; text-align-last: left;">
                                   <div><span>Wondering About Your Bag Size?</span>
                                   </div>
                                  </div>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                          <tr>
                           <td align="left" valign="top">
                            <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td class="pc-w620-spacing-0-24-30-24" valign="top" style="padding: 0px 32px 32px 0px;">
                               <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                <tr>
                                 <td valign="top" class="pc-w620-padding-0-0-0-0" align="left" style="padding: 0px 64px 0px 0px;">
                                  <div class="pc-font-alt pc-w620-fontSize-16 pc-w620-lineHeight-140pc" style="line-height: 140%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; font-variant-ligatures: normal; color: #121212; text-align: left; text-align-last: left;">
                                   <div><span>We&#39;ve made an update to our bag size. If you&#39;re curious about how much coffee you&#39;re getting or how the change benefits your Trade experience, please see our FAQs! </span>
                                   </div>
                                  </div>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                          <tr>
                           <td align="left" valign="top">
                            <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td style="padding: 0px 0px 0px 0px;">
                               <table class="pc-width-fill pc-w620-gridCollapsed-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr class="pc-grid-tr-first pc-grid-tr-last">
                                 <td class="pc-grid-td-first pc-w620-itemsSpacings-0-30" align="left" valign="top" style="padding-top: 0px; padding-right: 20px; padding-bottom: 0px; padding-left: 0px;">
                                  <table style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td class="pc-w620-padding-0-0-0-24" align="left" valign="top">
                                     <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="left" valign="top">
                                        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                         <tr>
                                          <th valign="top" align="left" style="padding: 0px 0px 0px 0px; text-align: left; font-weight: normal; line-height: 1;">
                                           <!--[if mso]>
        <table border="0" cellpadding="0" cellspacing="0" role="presentation" align="left" style="border-collapse: separate; border-spacing: 0;">
            <tr>
                <td valign="middle" align="center" style="border-radius: 500px 500px 500px 500px; background-color: #ff554a; text-align:center; color: #ffffff; padding: 12px 24px 12px 24px; mso-padding-left-alt: 0; margin-left:24px;" bgcolor="#ff554a">
                                    <a class="pc-font-alt" style="display: inline-block; text-decoration: none; font-variant-ligatures: normal; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-weight: bold; font-size: 16px; line-height: 24px; letter-spacing: -0px; text-align: center; color: #ffffff;" href="https://designmodo.com/postcards" target="_blank"><span style="display: block;"><span>Read FAQS</span></span></a>
                                </td>
            </tr>
        </table>
        <![endif]-->
                                           <!--[if !mso]><!-- -->
                                           <a style="display: inline-block; box-sizing: border-box; border-radius: 500px 500px 500px 500px; background-color: #ff554a; padding: 12px 24px 12px 24px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-weight: bold; font-size: 16px; line-height: 24px; letter-spacing: -0px; color: #ffffff; vertical-align: top; text-align: center; text-align-last: center; text-decoration: none; -webkit-text-size-adjust: none;" href="https://hibuyshopping.com/faq" target="_blank"><span style="display: block;"><span>Read FAQS</span></span></a>
                                           <!--<![endif]-->
                                          </th>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                 <td class="pc-grid-td-last pc-w620-itemsSpacings-0-30" align="left" valign="top" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 20px;">
                                  <table style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr>
                                    <td class="pc-w620-padding-0-0-0-20" align="right" valign="middle" style="padding: 0px 0px 0px 0px;">
                                     <table align="right" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                      <tr>
                                       <td align="right" valign="top">
                                        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                         <tr>
                                          <td align="right" valign="top" style="padding: 6px 0px 0px 0px;">
                                           <img src="https://cloudfilesdm.com/postcards/image-1702461539134.png" class="pc-w620-width-100pc pc-w620-height-100pc pc-w620-width-100pc-min" width="300" height="210" alt="" style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 300px; height: 210px; border: 0;" />
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                         </table>
                        </td>
                       </tr>
                      </table>
                     </td>
                    </tr>
                   </table>
                  </td>
                 </tr>
                </table>
               </td>
              </tr>
             </table>
            </td>
           </tr>
          </table>
          <!-- END MODULE: FAQ -->
         </td>
        </tr>
        <tr>
         <td valign="top">
          <!-- BEGIN MODULE: Call To Action -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
           <tr>
            <td class="pc-w620-spacing-0-0-0-0" style="padding: 0px 0px 0px 0px;">
             <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
              <tr>
               <td valign="top" class="pc-w620-padding-30-24-0-24" style="padding: 48px 32px 0px 32px; border-radius: 0px; background-color: #ffffff;" bgcolor="#ffffff">
                <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                 <tr>
                  <td>
                   <table class="pc-width-fill pc-w620-gridCollapsed-0" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                    <tr class="pc-grid-tr-first pc-grid-tr-last">
                     <td class="pc-grid-td-first pc-grid-td-last" align="center" valign="top" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 0px;">
                      <table style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                       <tr>
                        <td class="pc-w620-padding-32-32-32-32" align="center" valign="top" style="padding: 32px 32px 32px 32px; background-color: #fff8f0; border-radius: 8px 8px 8px 8px;">
                         <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                          <tr>
                           <td align="center" valign="top">
                            <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td valign="top" style="padding: 0px 0px 12px 0px;">
                               <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                <tr>
                                 <td valign="top" class="pc-w620-align-center" align="left" style="padding: 0px 0px 0px 0px;">
                                  <div class="pc-font-alt pc-w620-align-center pc-w620-fontSize-30 pc-w620-lineHeight-40" style="line-height: 128%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 32px; font-weight: bold; font-variant-ligatures: normal; color: #121212; text-align: left; text-align-last: left;">
                                   <div><span>Free shipping? That&#39;s great!</span>
                                   </div>
                                  </div>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                          <tr>
                           <td align="center" valign="top">
                            <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td valign="top" style="padding: 0px 0px 20px 0px;">
                               <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: separate; border-spacing: 0;">
                                <tr>
                                 <td valign="top" align="center">
                                  <div class="pc-font-alt pc-w620-fontSize-16 pc-w620-lineHeight-28" style="line-height: 140%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; font-variant-ligatures: normal; color: #121212cc; text-align: center; text-align-last: center;">
                                   <div><span>How about adding a little more? As a bonus, enjoy the perk of free shipping on your upcoming order.</span>
                                   </div>
                                  </div>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                          <tr>
                           <td align="center" valign="top">
                            <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <th valign="top" align="center" style="padding: 0px 0px 0px 0px; text-align: center; font-weight: normal; line-height: 1;">
                               <!--[if mso]>
        <table border="0" cellpadding="0" cellspacing="0" role="presentation" class="pc-w620-width-100pc" align="center" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
            <tr>
                <td valign="middle" align="center" style="border-radius: 500px 500px 500px 500px; background-color: #ff554a; text-align:center; color: #ffffff; padding: 12px 24px 12px 24px; mso-padding-left-alt: 0; margin-left:24px;" bgcolor="#ff554a">
                                    <a class="pc-font-alt" style="display: inline-block; text-decoration: none; font-variant-ligatures: normal; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-weight: bold; font-size: 16px; line-height: 26px; letter-spacing: -0px; text-align: center; color: #ffffff;" href="https://designmodo.com/postcards" target="_blank"><span style="display: block;"><span style="line-height: 24px;">Shop</span><span> Now</span></span></a>
                                </td>
            </tr>
        </table>
        <![endif]-->
                               <!--[if !mso]><!-- -->
                               <a class="pc-w620-width-100pc" style="display: inline-block; box-sizing: border-box; border-radius: 500px 500px 500px 500px; background-color: #ff554a; padding: 12px 24px 12px 24px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-weight: bold; font-size: 16px; line-height: 26px; letter-spacing: -0px; color: #ffffff; vertical-align: top; text-align: center; text-align-last: center; text-decoration: none; -webkit-text-size-adjust: none;" href="https://hibuyshopping.com" target="_blank"><span style="display: block;"><span style="line-height: 24px;">Shop</span><span> Now</span></span></a>
                               <!--<![endif]-->
                              </th>
                             </tr>
                            </table>
                           </td>
                          </tr>
                         </table>
                        </td>
                       </tr>
                      </table>
                     </td>
                    </tr>
                   </table>
                  </td>
                 </tr>
                </table>
               </td>
              </tr>
             </table>
            </td>
           </tr>
          </table>
          <!-- END MODULE: Call To Action -->
         </td>
        </tr>
        <tr>
         <td valign="top">
          <!-- BEGIN MODULE: Questions? -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
           <tr>
            <td class="pc-w620-spacing-0-0-0-0" style="padding: 0px 0px 0px 0px;">
             <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
              <tr>
               <td valign="top" class="pc-w620-padding-32-24-32-24" style="padding: 48px 32px 48px 32px; border-radius: 0px; background-color: #ffffff;" bgcolor="#ffffff">
                <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                 <tr>
                  <td align="center" valign="top" style="padding: 0px 0px 32px 0px;">
                   <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" align="center" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
                    <tr>
                     <td valign="top" align="center" style="padding: 0px 0px 0px 0px;">
                      <div class="pc-font-alt pc-w620-fontSize-14px pc-w620-lineHeight-140pc" style="line-height: 24px; letter-spacing: -0px; font-family: 'Nunito', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; font-variant-ligatures: normal; color: #121212; text-align: center; text-align-last: center;">
                       <div><span>If you need to cancel your order, email hibuyshoppingofficial@gmail.com in the next 30-minutes with your order number in the subject line and we&#39;ll cancel your order before it goes out and refund your purchase.</span>
                       </div>
                      </div>
                     </td>
                    </tr>
                   </table>
                  </td>
                 </tr>
                </table>
                <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                 <tr>
                  <td align="left">
                   <table align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                    <tr>
                     <td valign="top">
                      <table class="pc-width-hug pc-w620-gridCollapsed-1" align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                       <tr class="pc-grid-tr-first pc-grid-tr-last">
                        <td class="pc-grid-td-first pc-grid-td-last pc-w620-itemsSpacings-10-20" valign="top" style="width: 50%; padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 0px;">
                         <table style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                          <tr>
                           <td class="pc-w620-halign-center pc-w620-valign-top" align="left" valign="top" style="padding: 20px 20px 20px 20px; background-color: #fff8f0; border-radius: 8px 8px 8px 8px;">
                            <table class="pc-w620-halign-center" align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                             <tr>
                              <td class="pc-w620-halign-center" align="left" valign="top">
                               <table class="pc-w620-halign-center" align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                 <td class="pc-w620-valign-middle pc-w620-halign-center" align="left">
                                  <table class="pc-width-hug pc-w620-gridCollapsed-1 pc-w620-halign-center" align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                   <tr class="pc-grid-tr-first pc-grid-tr-last">
                                    <td class="pc-grid-td-first pc-w620-itemsSpacings-0-20" valign="middle" style="padding-top: 0px; padding-right: 6px; padding-bottom: 0px; padding-left: 0px;">
                                     <table class="pc-w620-width-fill" style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                       <td class="pc-w620-padding-0-0-0-0 pc-w620-halign-center pc-w620-valign-middle" align="left" valign="middle" style="padding: 0px 11px 0px 2px;">
                                        <table class="pc-w620-halign-center" align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                         <tr>
                                          <td class="pc-w620-halign-center" align="left" valign="top">
                                           <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                            <tr>
                                             <td class="pc-w620-halign-center" align="left" valign="top">
                                              <img src="https://cloudfilesdm.com/postcards/image-1702460591798.png" class="pc-w620-align-center" width="64" height="64" alt="" style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 64px; height: auto; max-width: 100%; border: 0;" />
                                             </td>
                                            </tr>
                                           </table>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                    <td class="pc-grid-td-last pc-w620-itemsSpacings-0-20" valign="middle" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 6px;">
                                     <table style="border-collapse: separate; border-spacing: 0; width: 100%;" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                       <td align="left" valign="middle" style="padding: 0px 0px 0px 0px;">
                                        <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                                         <tr>
                                          <td align="left" valign="top">
                                           <table width="100%" align="left" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                            <tr>
                                             <td valign="top" style="padding: 0px 0px 4px 0px;">
                                              <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" align="left" style="border-collapse: separate; border-spacing: 0;">
                                               <tr>
                                                <td valign="top" class="pc-w620-align-center" align="left" style="padding: 0px 0px 0px 0px;">
                                                 <div class="pc-font-alt pc-w620-align-center pc-w620-fontSize-20px" style="line-height: 21px; letter-spacing: -0.2px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: bold; font-variant-ligatures: normal; color: #121212; text-align: left; text-align-last: left;">
                                                  <div><span style="letter-spacing: 0px;">Any questions?</span>
                                                  </div>
                                                 </div>
                                                </td>
                                               </tr>
                                              </table>
                                             </td>
                                            </tr>
                                           </table>
                                          </td>
                                         </tr>
                                         <tr>
                                          <td align="left" valign="top">
                                           <table border="0" cellpadding="0" cellspacing="0" role="presentation" align="left" style="border-collapse: separate; border-spacing: 0;">
                                            <tr>
                                             <td valign="top" class="pc-w620-align-center" align="left">
                                              <div class="pc-font-alt pc-w620-align-center" style="line-height: 140%; letter-spacing: -0.2px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 15px; font-weight: normal; font-variant-ligatures: normal; color: #333333; text-align: left; text-align-last: left;">
                                               <div><span style="color: rgb(18, 18, 18);">﻿If you need any help whatsoever or just want to chat, email us anytime </span><span style="font-weight: 600;font-style: normal;color: rgb(255, 85, 74);">hibuyshoppingofficial@gmail.com</span>
                                               </div>
                                              </div>
                                             </td>
                                            </tr>
                                           </table>
                                          </td>
                                         </tr>
                                        </table>
                                       </td>
                                      </tr>
                                     </table>
                                    </td>
                                   </tr>
                                  </table>
                                 </td>
                                </tr>
                               </table>
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                         </table>
                        </td>
                       </tr>
                      </table>
                     </td>
                    </tr>
                   </table>
                  </td>
                 </tr>
                </table>
               </td>
              </tr>
             </table>
            </td>
           </tr>
          </table>
          <!-- END MODULE: Questions? -->
         </td>
        </tr>
        <tr>
         <td valign="top">
          <!-- BEGIN MODULE: Footer -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
           <tr>
            <td class="pc-w620-spacing-0-0-0-0" style="padding: 0px 0px 0px 0px;">
             <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
              <tr>
               <!--[if !gte mso 9]><!-- -->
               <td valign="top" class="pc-w620-padding-30-24-40-24" style="background-image: url('https://cloudfilesdm.com/postcards/image-1702463485006.png'); background-size: cover; background-position: center; background-repeat: no-repeat; padding: 50px 40px 50px 40px; border-radius: 0px; background-color: #1d1b2d;" bgcolor="#1d1b2d" background="https://cloudfilesdm.com/postcards/image-1702463485006.png">
                <!--<![endif]-->
                <!--[if gte mso 9]>
                <td valign="top" align="center" style="background-image: url('https://cloudfilesdm.com/postcards/image-1702463485006.png'); background-size: cover; background-position: center; background-repeat: no-repeat; background-color: #1d1b2d; border-radius: 0px;" bgcolor="#1d1b2d" background="https://cloudfilesdm.com/postcards/image-1702463485006.png">
            <![endif]-->
                <!--[if gte mso 9]>
                <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width: 600px;">
                    <v:fill src="https://cloudfilesdm.com/postcards/image-1702463485006.png" color="#1d1b2d" type="frame" size="1,1" aspect="atleast" origin="0,0" position="0,0"/>
                    <v:textbox style="mso-fit-shape-to-text: true;" inset="0,0,0,0">
                        <div style="font-size: 0; line-height: 0;">
                            <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                    <td style="font-size: 14px; line-height: 1.5;" valign="top">
                                        <p style="margin:0;mso-hide:all"><o:p xmlns:o="urn:schemas-microsoft-com:office:office">&nbsp;</o:p></p>
                                        <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
                                            <tr>
                                                <td colspan="3" height="50" style="line-height: 1px; font-size: 1px;">&nbsp;</td>
                                            </tr>
                                            <tr>
                                                <td width="40" valign="top" style="line-height: 1px; font-size: 1px;">&nbsp;</td>
                                                <td valign="top" align="left">
                <![endif]-->
                <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                 <tr>
                  <td class="pc-w620-spacing-0-0-20-0" align="center" style="padding: 0px 0px 40px 0px;">
                   <table class="pc-width-hug pc-w620-gridCollapsed-0" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                    <tr class="pc-grid-tr-first pc-grid-tr-last">
                     <td class="pc-grid-td-first pc-w620-itemsSpacings-20-0" valign="middle" style="padding-top: 0px; padding-right: 15px; padding-bottom: 0px; padding-left: 0px;">
                      <table style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                       <tr>
                        <td align="center" valign="middle">
                         <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                          <tr>
                           <td align="center" valign="top">
                            <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td valign="top">
                               <img src="https://cloudfilesdm.com/postcards/e414faf5d7c4bea6ab1040f02772418a.png" class="" width="20" height="20" style="display: block; border: 0; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 20px; height: 20px;" alt="" />
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                         </table>
                        </td>
                       </tr>
                      </table>
                     </td>
                     <td class="pc-w620-itemsSpacings-20-0" valign="middle" style="padding-top: 0px; padding-right: 15px; padding-bottom: 0px; padding-left: 15px; mso-padding-left-alt: 0; margin-left: 15px;">
                      <table style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                       <tr>
                        <td align="center" valign="middle">
                         <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                          <tr>
                           <td align="center" valign="top">
                            <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td valign="top">
                               <img src="https://cloudfilesdm.com/postcards/2249492905cbf066d1e2999ef53bc950.png" class="" width="20" height="20" style="display: block; border: 0; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 20px; height: 20px;" alt="" />
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                         </table>
                        </td>
                       </tr>
                      </table>
                     </td>
                     <td class="pc-w620-itemsSpacings-20-0" valign="middle" style="padding-top: 0px; padding-right: 15px; padding-bottom: 0px; padding-left: 15px; mso-padding-left-alt: 0; margin-left: 15px;">
                      <table style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                       <tr>
                        <td align="center" valign="middle">
                         <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                          <tr>
                           <td align="center" valign="top">
                            <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td valign="top">
                               <img src="https://cloudfilesdm.com/postcards/ee4af7579ffc3dce51513f4dbea9247e.png" class="" width="20" height="20" style="display: block; border: 0; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 20px; height: 20px;" alt="" />
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                         </table>
                        </td>
                       </tr>
                      </table>
                     </td>
                     <td class="pc-grid-td-last pc-w620-itemsSpacings-20-0" valign="middle" style="padding-top: 0px; padding-right: 0px; padding-bottom: 0px; padding-left: 15px; mso-padding-left-alt: 0; margin-left: 15px;">
                      <table style="border-collapse: separate; border-spacing: 0;" border="0" cellpadding="0" cellspacing="0" role="presentation">
                       <tr>
                        <td align="center" valign="middle">
                         <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
                          <tr>
                           <td align="center" valign="top">
                            <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
                             <tr>
                              <td valign="top">
                               <img src="https://cloudfilesdm.com/postcards/c6b319438094394cd73a13ca345d9098.png" class="" width="20" height="20" style="display: block; border: 0; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 20px; height: 20px;" alt="" />
                              </td>
                             </tr>
                            </table>
                           </td>
                          </tr>
                         </table>
                        </td>
                       </tr>
                      </table>
                     </td>
                    </tr>
                   </table>
                  </td>
                 </tr>
                </table>
                <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                 <tr>
                  <td class="pc-w620-align-center" align="center" valign="top" style="padding: 0px 0px 20px 0px;">
                   <table border="0" cellpadding="0" cellspacing="0" role="presentation" class="pc-w620-align-center" width="100%" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
                    <tr>
                     <td valign="top" class="pc-w620-align-center" align="center" style="padding: 0px 0px 0px 0px;">
                      <div class="pc-font-alt pc-w620-align-center pc-w620-fontSize-14px" style="line-height: 130%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; font-variant-ligatures: normal; color: #ffffffcc; text-align: center; text-align-last: center;">
                       <div><span>© Hibuyshopping. All Rights Reserved.<br/>242 D2, JOHAR TOWN, LAHORE.</span>
                       </div>
                      </div>
                     </td>
                    </tr>
                   </table>
                  </td>
                 </tr>
                </table>
                <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                 <tr>
                  <td class="pc-w620-spacing-0-0-0-0 pc-w620-align-center" align="center" valign="top" style="padding: 0px 0px 0px 0px;">
                   <table border="0" cellpadding="0" cellspacing="0" role="presentation" class="pc-w620-align-center" width="100%" style="border-collapse: separate; border-spacing: 0; margin-right: auto; margin-left: auto;">
                    <tr>
                     <td valign="top" class="pc-w620-padding-0-0-0-0 pc-w620-align-center" align="center" style="padding: 0px 0px 0px 0px;">
                      <div class="pc-font-alt pc-w620-align-center pc-w620-fontSize-14px" style="line-height: 130%; letter-spacing: -0px; font-family: 'Nunito Sans', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; font-variant-ligatures: normal; color: #ffffffcc; text-align: center; text-align-last: center;">
                       <div><span>Prefer not to receive these emails anymore </span><a href="https://hibuyshopping.com" style="text-decoration: none; color: #ffffffcc;"><span style="text-decoration: underline;font-weight: 600;font-style: normal;color: rgb(255, 255, 255);">Unsubscribe here.</span></a><span>&#xFEFF;</span>
                       </div>
                      </div>
                     </td>
                    </tr>
                   </table>
                  </td>
                 </tr>
                </table>
                <!--[if gte mso 9]>
                                                </td>
                                                <td width="40" style="line-height: 1px; font-size: 1px;" valign="top">&nbsp;</td>
                                            </tr>
                                            <tr>
                                                <td colspan="3" height="50" style="line-height: 1px; font-size: 1px;">&nbsp;</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </div>
                        <p style="margin:0;mso-hide:all"><o:p xmlns:o="urn:schemas-microsoft-com:office:office">&nbsp;</o:p></p>
                    </v:textbox>
                </v:rect>
                <![endif]-->
               </td>
              </tr>
             </table>
            </td>
           </tr>
          </table>
          <!-- END MODULE: Footer -->
         </td>
        </tr>
        <!-- <tr>
         <td>
          <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
           <tr>
            <td align="center" valign="top" style="padding-top: 20px; padding-bottom: 20px; vertical-align: top;">
             <a href="https://postcards.email/?uid=Mjg2MTU1&type=footer" target="_blank" style="text-decoration: none; overflow: hidden; border-radius: 2px; display: inline-block;">
              <img src="https://cloudfilesdm.com/postcards/promo-footer-dark.jpg" width="198" height="46" alt="Made with (o -) postcards" style="width: 198px; height: auto; margin: 0 auto; border: 0; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; vertical-align: top;">
             </a>
             <img src="https://api-postcards.designmodo.com/tracking/mail/promo?uid=Mjg2MTU1" width="1" height="1" alt="" style="display:none; width: 1px; height: 1px;">
            </td>
           </tr>
          </table>
         </td>
        </tr> -->
       </table>
      </td>
     </tr>
    </table>
   </td>
  </tr>
 </table>
</body>

</html>

    `;
//     const htmlContentForUser = `
// <!DOCTYPE html>
// <html lang="en">
// <head>
//   <meta charset="UTF-8">
//   <meta name="viewport" content="width=device-width, initial-scale=1.0">
//   <title>Order Slip</title>
//   <style>
//     body {
//       font-family: 'Arial', sans-serif;
//       background-color: #f9f9f9;
//       margin: 0;
//       padding: 0;
//     }
//     .container {
//       width: 100%;
//       max-width: 600px;
//       margin: 20px auto;
//       background-color: #fff;
//       border-radius: 8px;
//       box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
//       overflow: hidden;
//     }
//     .header {
//       background-color: #ff6f00;
//       color: #fff;
//       padding: 20px;
//       text-align: center;
//     }
//     .header h1 {
//       margin: 0;
//       font-size: 24px;
//     }
//     .content {
//       padding: 20px;
//     }
//     .order-details {
//       margin-bottom: 20px;
//       line-height: 1.6;
//     }
//     .order-details p {
//       margin: 0 0 8px;
//       color: #555;
//     }
//     .order-items {
//       width: 100%;
//       border-collapse: collapse;
//       margin-bottom: 20px;
//     }
//     .order-items th {
//       background-color: #ffe0b2;
//       color: #555;
//       text-align: left;
//       padding: 10px;
//       font-size: 14px;
//     }
//     .order-items td {
//       padding: 10px;
//       border: 1px solid #ddd;
//       font-size: 14px;
//       color: #555;
//     }
//     .order-items tr:nth-child(even) {
//       background-color: #f9f9f9;
//     }
//     .order-total {
//       text-align: right;
//       font-size: 18px;
//       font-weight: bold;
//       margin-top: 10px;
//       color: #ff6f00;
//     }
//     .footer {
//       background-color: #fafafa;
//       text-align: center;
//       padding: 15px;
//       font-size: 12px;
//       color: #999;
//       border-top: 1px solid #eee;
//     }
//   </style>
// </head>
// <body>
//   <div class="container">
//     <div class="header">
//       <h1>HiBuyShopping - Order Receipt</h1>
//     </div>
//     <div class="content">
//       <div class="order-details">
//       <p>Thank you for your order, <strong>${fullName}</strong>!</p>
//       <p><strong>Order Number:</strong> ${parentOrderId}</p>
//       </div>
//       <table class="order-items">
//         <thead>
//           <tr>
//             <th>Product</th>
//             <th>Quantity</th>
//             <th>Price</th>
//             <th>Total</th>
//           </tr>
//         </thead>
//         <tbody>
//            ${cartItems
//              .flatMap((shop) =>
//                shop.items.map(
//                  (item) => `
//             <tr>
//               <td>${item.name}</td>
//               <td>${item.quantity}</td>
//               <td>${item.price}</td>
//               <td>${item.price * item.quantity}</td>
//             </tr>
//           `
//                )
//              )
//              .join("")}
//         </tbody>
//       </table>
//       <div class="order-total">
//         Total: ${totalAmount.toFixed(2)} PKR
//       </div>
//     </div>
//     <div class="footer">
//       &copy; 2024 HiBuyShopping. All rights reserved.
//     </div>
//   </div>
// </body>
// </html>
// `;
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

import express from "express";
import sql from "mssql";
import { dbConnect } from "../database/dbConfig.js";
import createCouponsTable from "../tables/coupons.js";

const router = express.Router();

router.post("/create", async (req, res) => {
  const {
    Code,
    DiscountType,
    DiscountValue,
    MinimumOrderValue,
    StartDate,
    EndDate,
    UsageLimit,
    VendorId,
  } = req.body;

  try {
    createCouponsTable();
    const pool = await sql.connect(dbConnect);
    const query = `
            INSERT INTO Coupons (Code, DiscountType, DiscountValue, MinimumOrderValue, StartDate, EndDate, UsageLimit, VendorId)
            VALUES (@Code, @DiscountType, @DiscountValue, @MinimumOrderValue, @StartDate, @EndDate, @UsageLimit, @VendorId);
        `;
    await pool
      .request()
      .input("Code", sql.NVarChar, Code)
      .input("DiscountType", sql.NVarChar, DiscountType)
      .input("DiscountValue", sql.Decimal(10, 2), DiscountValue)
      .input("MinimumOrderValue", sql.Decimal(10, 2), MinimumOrderValue)
      .input("StartDate", sql.DateTime, StartDate)
      .input("EndDate", sql.DateTime, EndDate)
      .input("UsageLimit", sql.Int, UsageLimit)
      .input("VendorId", sql.UniqueIdentifier, VendorId)
      .query(query);

    res.status(201).json({ message: "Coupon created successfully." });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Error creating coupon.", error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const {
    Code,
    DiscountType,
    DiscountValue,
    MinimumOrderValue,
    StartDate,
    EndDate,
    UsageLimit,
  } = req.body;

  try {
    const pool = await sql.connect(dbConnect);
    const query = `
            UPDATE Coupons
            SET Code = @Code,
                DiscountType = @DiscountType,
                DiscountValue = @DiscountValue,
                MinimumOrderValue = @MinimumOrderValue,
                StartDate = @StartDate,
                EndDate = @EndDate,
                UsageLimit = @UsageLimit
            WHERE CouponId = @CouponId;
        `;
    await pool
      .request()
      .input("CouponId", sql.UniqueIdentifier, id)
      .input("Code", sql.NVarChar, Code)
      .input("DiscountType", sql.NVarChar, DiscountType)
      .input("DiscountValue", sql.Decimal(10, 2), DiscountValue)
      .input("MinimumOrderValue", sql.Decimal(10, 2), MinimumOrderValue)
      .input("StartDate", sql.DateTime, StartDate)
      .input("EndDate", sql.DateTime, EndDate)
      .input("UsageLimit", sql.Int, UsageLimit)
      .query(query);

    res.status(200).json({ message: "Coupon updated successfully." });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Error updating coupon.", error: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const pool = await sql.connect(dbConnect);
    const query = `SELECT * FROM Coupons;`;
    const result = await pool.request().query(query);

    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Error fetching coupons.", error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await sql.connect(dbConnect);
    const query = `SELECT * FROM Coupons WHERE CouponId = @CouponId;`;
    const result = await pool
      .request()
      .input("CouponId", sql.UniqueIdentifier, id)
      .query(query);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Coupon not found." });
    }

    res.status(200).json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Error fetching coupon.", error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await sql.connect(dbConnect);
    const query = `DELETE FROM Coupons WHERE CouponId = @CouponId;`;
    await pool
      .request()
      .input("CouponId", sql.UniqueIdentifier, id)
      .query(query);

    res.status(200).json({ message: "Coupon deleted successfully." });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Error deleting coupon.", error: err.message });
  }
});

router.get("/vendor/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "VendorId is required." });
    }

    const pool = await sql.connect(dbConnect);
    const query = `
      SELECT * FROM Coupons
      WHERE VendorId = @VendorId
    `;

    const result = await pool
      .request()
      .input("VendorId", sql.UniqueIdentifier, id)
      .query(query);

    res.status(200).json(result.recordset);
  } catch (error) {
    console.error("Error fetching coupons:", error);
    res.status(500).json({ message: "Failed to fetch coupons." });
  }
});

// router.post("/validate", async (req, res) => {
//   const { couponCode, orderValue } = req.body;
//   console.log(req.body);
//   if (!couponCode || !orderValue ) {
//     return res.status(400).json({
//       success: false,
//       message: "Coupon code, order value are required.",
//     });
//   }

//   try {
//     const pool = await sql.connect(dbConnect);
//     const query = `
//       SELECT *
//       FROM Coupons
//       WHERE Code = @couponCode
//         AND GETDATE() BETWEEN StartDate AND EndDate
//         AND (UsageLimit IS NULL OR UsageCount < UsageLimit)
//     `;

//     const result = await pool
//       .request()
//       .input("couponCode", sql.NVarChar, couponCode)
//       // .input("vendorId", sql.UniqueIdentifier, vendorId)
//       .query(query);

//     if (result.recordset.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Invalid, expired, or fully used coupon code.",
//       });
//     }

//     const coupon = result.recordset[0];

//     if (orderValue < coupon.MinimumOrderValue) {
//       return res.status(400).json({
//         success: false,
//         message: `Order value must be at least ${coupon.MinimumOrderValue} to use this coupon.`,
//       });
//     }

//     let discount = 0;
//     if (coupon.DiscountType === "percentage") {
//       discount = (orderValue * coupon.DiscountValue) / 100;
//     } else if (coupon.DiscountType === "fixed") {
//       discount = coupon.DiscountValue;
//     }

//     return res.status(200).json({
//       success: true,
//       coupon,
//       discountAmount: discount.toFixed(2),
//       message: "Coupon applied successfully.",
//     });
//   } catch (error) {
//     console.error("Error validating coupon:", error.message);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error. Please try again later.",
//     });
//   }
// });
router.post("/validate", async (req, res) => {
  const { couponCode, orderValue } = req.body;
  console.log(req.body);
  if (!couponCode || !orderValue) {
    return res.status(400).json({
      success: false,
      message: "Coupon code and order value are required.",
    });
  }

  try {
    const pool = await sql.connect(dbConnect);
    const query = `
  SELECT Code, DiscountType, DiscountValue, MinimumOrderValue, UsageCount, UsageLimit, StartDate, EndDate
  FROM Coupons
  WHERE Code = @couponCode
    AND (StartDate IS NULL OR GETDATE() >= StartDate)
    AND (EndDate IS NULL OR GETDATE() <= EndDate)
    AND (UsageLimit IS NULL OR UsageCount < UsageLimit)
`;

    const result = await pool
      .request()
      .input("couponCode", sql.NVarChar, couponCode)
      .query(query);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Invalid, expired, or fully used coupon code.",
      });
    }

    // const query = `
    //   SELECT Code, DiscountType, DiscountValue, MinimumOrderValue, UsageCount, UsageLimit, StartDate, EndDate
    //   FROM Coupons
    //   WHERE Code = @couponCode
    //     AND GETDATE() BETWEEN StartDate AND EndDate
    //     AND (UsageLimit IS NULL OR UsageCount < UsageLimit)
    // `;

    // const result = await pool
    //   .request()
    //   .input("couponCode", sql.NVarChar, couponCode)
    //   .query(query);

    // if (result.recordset.length === 0) {
    //   return res.status(404).json({
    //     success: false,
    //     message: "Invalid, expired, or fully used coupon code.",
    //   });
    // }

    const coupon = result.recordset[0];

    if (orderValue < coupon.MinimumOrderValue) {
      return res.status(400).json({
        success: false,
        message: `Order value must be at least ${coupon.MinimumOrderValue} to use this coupon.`,
      });
    }

    let discount = 0;
    if (coupon.DiscountType === "Percentage") {
      discount = (orderValue * coupon.DiscountValue) / 100;
    } else if (coupon.DiscountType === "Flat") {
      discount = coupon.DiscountValue;
    }

    // if (coupon.MaxDiscountValue && discount > coupon.MaxDiscountValue) {
    //   discount = coupon.MaxDiscountValue;
    // }

    return res.status(200).json({
      success: true,
      coupon,
      discountAmount: discount.toFixed(2),
      message: "Coupon applied successfully.",
    });
  } catch (error) {
    console.error("Error validating coupon:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Please try again later.",
    });
  }
});

export default router;

import express from 'express';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

const router = express.Router()

router.post('/product/:productId/question', async (req, res) => {
    const { productId } = req.params;
    const { userId, question } = req.body;

    if (!userId || !question) {
        return res.status(400).json({ message: 'User ID and question are required' });
    }

    try {
        const pool = await sql.connect(dbConnect);

        const getShopIdQuery = `
            SELECT ShopId FROM Products WHERE Id = @ProductId;
        `;
        const shopResult = await pool.request()
            .input('ProductId', sql.UniqueIdentifier, productId)
            .query(getShopIdQuery);

        if (shopResult.recordset.length === 0) {
            return res.status(404).json({ message: 'Product not found.' });
        }

        const shopId = shopResult.recordset[0].ShopId;

        const insertQuestionQuery = `
            INSERT INTO Questions (ProductId, UserId, ShopId, Question)
            VALUES (@ProductId, @UserId, @ShopId, @Question);
        `;
        await pool.request()
            .input('ProductId', sql.UniqueIdentifier, productId)
            .input('UserId', sql.UniqueIdentifier, userId)
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .input('Question', sql.NVarChar(sql.MAX), question)
            .query(insertQuestionQuery);

        res.status(201).json({ message: 'Question submitted successfully' });
    } catch (error) {
        console.error('Error submitting question:', error);
        res.status(500).json({ message: 'Error submitting question' });
    }
});
router.post('/question/:questionId/reply', async (req, res) => {
    const { questionId } = req.params;
    const { shopId, reply } = req.body;

    if (!shopId || !reply) {
        return res.status(400).json({ message: 'Shop ID and reply are required' });
    }

    try {
        const pool = await sql.connect(dbConnect);

        // Verify if the shop owns a product associated with the question
        const verifyOwnershipQuery = `
            SELECT p.Id
            FROM Products p
            JOIN Questions q ON p.Id = q.ProductId
            WHERE q.Id = @QuestionId AND p.ShopId = @ShopId;
        `;
        const ownershipResult = await pool.request()
            .input('QuestionId', sql.UniqueIdentifier, questionId)
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .query(verifyOwnershipQuery);

        // if (ownershipResult.recordset.length === 0) {
        //     return res.status(403).json({ message: 'Only the shop owner can reply to this question.' });
        // }

        const insertReplyQuery = `
            INSERT INTO QuestionReplies (QuestionId, ShopId, Reply)
            VALUES (@QuestionId, @ShopId, @Reply);
        `;
        await pool.request()
            .input('QuestionId', sql.UniqueIdentifier, questionId)
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .input('Reply', sql.NVarChar(sql.MAX), reply)
            .query(insertReplyQuery);

        res.status(201).json({ message: 'Reply added successfully' });
    } catch (error) {
        console.error('Error adding reply:', error);
        res.status(500).json({ message: 'Error adding reply' });
    }
});
router.get('/product/:productId/questions', async (req, res) => {
    const { productId } = req.params;

    try {
        const pool = await sql.connect(dbConnect);

        const getQuestionsQuery = `
            SELECT q.Id AS QuestionId, q.UserId, q.Question, q.CreatedAt AS QuestionCreatedAt,
                   r.Id AS ReplyId, r.ShopId, r.Reply, r.CreatedAt AS ReplyCreatedAt
            FROM Questions q
            LEFT JOIN QuestionReplies r ON q.Id = r.QuestionId
            WHERE q.ProductId = @ProductId
            ORDER BY q.CreatedAt DESC;
        `;

        const questionsResult = await pool.request()
            .input('ProductId', sql.UniqueIdentifier, productId)
            .query(getQuestionsQuery);

        const questions = questionsResult.recordset.reduce((acc, row) => {
            const question = acc.find(q => q.QuestionId === row.QuestionId);
            if (question) {
                if (row.ReplyId) {
                    question.replies.push({
                        ReplyId: row.ReplyId,
                        ShopId: row.ShopId,
                        Reply: row.Reply,
                        ReplyCreatedAt: row.ReplyCreatedAt
                    });
                }
            } else {
                acc.push({
                    QuestionId: row.QuestionId,
                    UserId: row.UserId,
                    Question: row.Question,
                    QuestionCreatedAt: row.QuestionCreatedAt,
                    replies: row.ReplyId ? [{
                        ReplyId: row.ReplyId,
                        ShopId: row.ShopId,
                        Reply: row.Reply,
                        ReplyCreatedAt: row.ReplyCreatedAt
                    }] : []
                });
            }
            return acc;
        }, []);

        res.status(200).json(questions);
    } catch (error) {
        console.error('Error fetching questions and replies:', error);
        res.status(500).json({ message: 'Error fetching questions and replies' });
    }
});
router.patch('/question/:questionId', async (req, res) => {
    const { questionId } = req.params;
    const { userId, updatedQuestion } = req.body;

    if (!userId || !updatedQuestion) {
        return res.status(400).json({ message: 'User ID and updated question text are required.' });
    }

    try {
        const pool = await sql.connect(dbConnect);

        const updateQuestionQuery = `
            UPDATE Questions
            SET Question = @UpdatedQuestion, UpdatedAt = GETDATE()
            WHERE Id = @QuestionId AND UserId = @UserId;
        `;
        const result = await pool.request()
            .input('QuestionId', sql.UniqueIdentifier, questionId)
            .input('UserId', sql.UniqueIdentifier, userId)
            .input('UpdatedQuestion', sql.NVarChar(sql.MAX), updatedQuestion)
            .query(updateQuestionQuery);

        if (result.rowsAffected[0] === 0) {
            return res.status(403).json({ message: 'Unable to edit question. Ensure you are the owner.' });
        }

        res.status(200).json({ message: 'Question updated successfully' });
    } catch (error) {
        console.error('Error updating question:', error);
        res.status(500).json({ message: 'Error updating question' });
    }
});
router.patch('/question/:questionId/reply/:replyId', async (req, res) => {
    const { questionId, replyId } = req.params;
    const { shopId, updatedReply } = req.body;

    if (!shopId || !updatedReply) {
        return res.status(400).json({ message: 'Shop ID and updated reply text are required.' });
    }

    try {
        const pool = await sql.connect(dbConnect);

        const updateReplyQuery = `
            UPDATE QuestionReplies
            SET Reply = @UpdatedReply, UpdatedAt = GETDATE()
            WHERE Id = @ReplyId AND ShopId = @ShopId;
        `;
        const result = await pool.request()
            .input('ReplyId', sql.UniqueIdentifier, replyId)
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .input('UpdatedReply', sql.NVarChar(sql.MAX), updatedReply)
            .query(updateReplyQuery);

        if (result.rowsAffected[0] === 0) {
            return res.status(403).json({ message: 'Unable to edit reply. Ensure you are the owner.' });
        }

        res.status(200).json({ message: 'Reply updated successfully' });
    } catch (error) {
        console.error('Error updating reply:', error);
        res.status(500).json({ message: 'Error updating reply' });
    }
});
// router.get('/shop/:shopId', async (req, res) => {
//     const { shopId } = req.params;

//     try {
//         const pool = await sql.connect(dbConnect);

//         const getQuestionsQuery = `
//             SELECT q.Id AS QuestionId, q.UserId, q.Question, q.CreatedAt AS QuestionCreatedAt,
//                    r.Id AS ReplyId, r.ShopId, r.Reply, r.CreatedAt AS ReplyCreatedAt,
//                    p.Id AS ProductId, p.Name AS ProductName
//             FROM Questions q
//             INNER JOIN Products p ON q.ProductId = p.Id
//             LEFT JOIN QuestionReplies r ON q.Id = r.QuestionId
//             WHERE p.ShopId = @ShopId
//             ORDER BY q.CreatedAt DESC;
//         `;

//         const questionsResult = await pool.request()
//             .input('ShopId', sql.UniqueIdentifier, shopId)
//             .query(getQuestionsQuery);

//         const questions = questionsResult.recordset.reduce((acc, row) => {
//             const question = acc.find(q => q.QuestionId === row.QuestionId);
//             if (question) {
//                 if (row.ReplyId) {
//                     question.replies.push({
//                         ReplyId: row.ReplyId,
//                         ShopId: row.ShopId,
//                         Reply: row.Reply,
//                         ReplyCreatedAt: row.ReplyCreatedAt
//                     });
//                 }
//             } else {
//                 acc.push({
//                     QuestionId: row.QuestionId,
//                     UserId: row.UserId,
//                     Question: row.Question,
//                     QuestionCreatedAt: row.QuestionCreatedAt,
//                     ProductId: row.ProductId,
//                     ProductName: row.ProductName,
//                     replies: row.ReplyId ? [{
//                         ReplyId: row.ReplyId,
//                         ShopId: row.ShopId,
//                         Reply: row.Reply,
//                         ReplyCreatedAt: row.ReplyCreatedAt
//                     }] : []
//                 });
//             }
//             return acc;
//         }, []);

//         res.status(200).json(questions);
//     } catch (error) {
//         console.error('Error fetching questions and replies:', error);
//         res.status(500).json({ message: 'Error fetching questions and replies' });
//     }
// });
router.get('/shop/:shopId', async (req, res) => {
    const { shopId } = req.params;

    try {
        const pool = await sql.connect(dbConnect);

        const getQuestionsQuery = `
            SELECT q.Id AS QuestionId, q.UserId, q.Question, q.CreatedAt AS QuestionCreatedAt,
                   r.Id AS ReplyId, r.ShopId, r.Reply, r.CreatedAt AS ReplyCreatedAt,
                   p.Id AS ProductId, p.Name AS ProductName, p.Images AS ProductImages,
                   u.Name AS UserName, u.Images AS UserLogo
            FROM Questions q
            INNER JOIN Products p ON q.ProductId = p.Id
            LEFT JOIN QuestionReplies r ON q.Id = r.QuestionId
            LEFT JOIN Users u ON q.UserId = u.Id
            WHERE p.ShopId = @ShopId
            ORDER BY q.CreatedAt DESC;
        `;

        const questionsResult = await pool.request()
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .query(getQuestionsQuery);

        const questions = questionsResult.recordset.reduce((acc, row) => {
            const question = acc.find(q => q.QuestionId === row.QuestionId);
            if (question) {
                if (row.ReplyId) {
                    question.replies.push({
                        ReplyId: row.ReplyId,
                        ShopId: row.ShopId,
                        Reply: row.Reply,
                        ReplyCreatedAt: row.ReplyCreatedAt
                    });
                }
            } else {
                acc.push({
                    QuestionId: row.QuestionId,
                    UserId: row.UserId,
                    UserName: row.UserName,
                    UserLogo: row.UserLogo,
                    Question: row.Question,
                    QuestionCreatedAt: row.QuestionCreatedAt,
                    ProductId: row.ProductId,
                    ProductName: row.ProductName,
                    ProductImages: row.ProductImages ? JSON.parse(row.ProductImages) : [],
                    replies: row.ReplyId ? [{
                        ReplyId: row.ReplyId,
                        ShopId: row.ShopId,
                        Reply: row.Reply,
                        ReplyCreatedAt: row.ReplyCreatedAt
                    }] : []
                });
            }
            return acc;
        }, []);

        res.status(200).json(questions);
    } catch (error) {
        console.error('Error fetching questions and replies:', error);
        res.status(500).json({ message: 'Error fetching questions and replies' });
    }
});


export default router;
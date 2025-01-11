import express from 'express';
import dotenv from 'dotenv'
import bodyParser from 'body-parser';
import cors from 'cors'
import { dbConnect } from './database/dbConfig.js';
import { Server } from 'socket.io';
import http from 'http';
import mssql from 'mssql'

dotenv.config();
const app = express();
// const port = process.env.PORT || 3700
app.use(express.json({ limit: '17mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());
app.options('*', cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());



import userRoute from './routes/user.js'
import categoryRoute from './routes/category.js'
import subCategoryRoute from './routes/subCategory.js'
import subsubCategoryRoute from './routes/subSubCategory.js'
import itemsCategoryRoute from './routes/items.js'
import occasionRoute from './routes/occasion.js'
import productRoute from './routes/Product.js'
import sizesRoute from './routes/sizes.js'
import colorsRoute from './routes/colors.js'
import wishlistRoute from './routes/wishlist.js'
import orderRoute from './routes/order.js'
import shopsRoute from './routes/shop.js'
import seasonsRoute from './routes/seasons.js'
import reviewsRoute from './routes/reviews.js'
import questionsRoute from './routes/questionAnswers.js'
import cancellationsRoute from './routes/ordercancellation.js'
import returnsRoute from './routes/returns.js'
import brandsRoute from './routes/brands.js'
import opaymentsRoute from './routes/orderpayments.js'
import bankdetailsroute from './routes/vendorsBankDetails.js'
import shopTokens from './routes/shopTokens.js'
import addressesRoute from './routes/addresses.js'
import couponsRoute from './routes/coupons.js'

app.use('/api/v1/user', userRoute)
app.use('/api/v1/category', categoryRoute)
app.use('/api/v1/subcategory', subCategoryRoute)
app.use('/api/v1/subsubcategory', subsubCategoryRoute)
app.use('/api/v1/items', itemsCategoryRoute)
app.use('/api/v1/products', productRoute)
app.use('/api/v1/occasions', occasionRoute)
app.use('/api/v1/sizes', sizesRoute)
app.use('/api/v1/colors', colorsRoute)
app.use('/api/v1/seasons', seasonsRoute)
app.use('/api/v1/wishlist', wishlistRoute)
app.use('/api/v1/orders', orderRoute)
app.use('/api/v1/shops', shopsRoute)
app.use('/api/v1/reviews', reviewsRoute)
app.use('/api/v1/questions', questionsRoute)
app.use('/api/v1/cancellations', cancellationsRoute)
app.use('/api/v1/returns', returnsRoute)
app.use('/api/v1/brands', brandsRoute)
app.use('/api/v1/opayments', opaymentsRoute)
app.use('/api/v1/vendors-bank-details', bankdetailsroute)
app.use('/api/v1/shop-tokens', shopTokens)
app.use('/api/v1/addresses', addressesRoute)
app.use('/api/v1/coupons', couponsRoute)


const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ["GET", "POST"],
  },
});

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
  
    socket.on('joinRoom', (roomId) => {
      socket.join(roomId);
      console.log(`User with ID ${socket.id} joined room ${roomId}`);
    });
  
    socket.on('sendMessage', async ({ roomId, sender, message }) => {
      io.to(roomId).emit('receiveMessage', { sender, message });
  
      const pool = await mssql.connect(dbConnect);
      await pool.request()
        .input('roomId', mssql.UniqueIdentifier, roomId)
        .input('sender', mssql.NVarChar(255), sender)
        .input('message', mssql.NVarChar(500), message)
        .query('INSERT INTO ChatLogs (RoomId, Sender, Message) VALUES (@roomId, @sender, @message)');
    });
  
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  
const startServer = async () => {
  try {

await dbConnect;

    const port = process.env.PORT || 3700; 

    server.listen(port, () => {
      console.log(`HTTP Server running at http://localhost:${port}`);
    });
  } catch (err) {
    console.error("Error starting server:", err);
  }
};

startServer();

// app.listen(port, () => {
//     console.log(`Server is running on http://localhost:${port}`);
// });

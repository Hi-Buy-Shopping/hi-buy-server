import nodemailer from 'nodemailer'


const sendVerificationEmail = async (to, user, verifyCode) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'hibuyshoppingofficial@gmail.com',
      pass: 'albr myug eldw bzzf',
    },
  });

  const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forgot Password</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background-color: #f4f4f4;
        margin: 0;
        padding: 0;
        overflow-x: hidden;
        box-sizing: border-box;
      }
      .container {
        width: 100%;
        max-width: 600px;
        margin: 0 auto;
        background-color: #ffffff;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
      }
      .header {
        background-color: #f85606;
        padding: 20px;
        text-align: center;
        color: #ffffff;
        border-radius: 8px 8px 0 0;
      }
      .content {
        padding: 20px;
        text-align: left;
      }
      .footer {
        text-align: center;
        padding: 20px;
        color: #777777;
        font-size: 12px;
      }
      .code {
        font-size: 24px;
        font-weight: bold;
        color: #f85606;
        text-align: center;
        margin: 20px 0;
      }
      .button {
        display: inline-block;
        background-color: #4CAF50;
        color: #ffffff;
        padding: 10px 20px;
        text-decoration: none;
        border-radius: 5px;
        margin: 20px 0;
        text-align: center;
      }
      .button:hover {
        background-color: #45a049;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>HiBuyShopping</h1>
      </div>
      <div class="content">
        <p>Hello ${user},</p>
        <p>Thanks for starting the new Hibuyshopping account creation process. We want to make sure it's really you. Please enter the following verification code when prompted.
          If you don't want to create an account, you can ignore this message.</p>
        <div class="code">${verifyCode}</div>
        <p>If you did not request this, please ignore this email.</p>
      </div>
      <div class="footer">
        <p>&copy; 2024 HiBuyShopping. All rights reserved.</p>
      </div>
    </div>
  </body>
  </html>
`;

  const mailOptions = {
    from: 'HiBuyShopping <hibuyshoppingofficial@gmail.com>',
    to,
    subject: "Hibuyshopping | Verification Code",
    html: htmlContent,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('Error sending email:', err);
  }
};

export { sendVerificationEmail };

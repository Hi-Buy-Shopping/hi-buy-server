const { Html, Head, Font, Preview, Heading, Row, Section, Text, Hr, Img } = require('@react-email/components');

const VerificationEmail = ({ name, otp }) => {
  return (
    Html({
      lang: 'en',
      dir: 'ltr',
      children: [
        Head({
          children: [
            Row({
              children: 
              Img({
                src: "https://img.icons8.com/fluency/96/font-style-formatting.png",
                width: "96",
                height: "96",
                alt: "Eliph's Logo"
              }),
              style: {
                background: "#add8e6",
                height: "120px",
                width: "100%",
                padding: "15px 0px",
                paddingLeft: "35%",
                display: 'flex',
                alignItems: "center",
                justifyContent: "center"
              }
            }),
          ],
        }),
        Preview({
          children: `Here &apos;s your verification code: ${otp}`,
        }),
        Section({
          children: [
            Row({
              children: Heading({
                as: 'h3',
                children: `Verify your email address`,
              }),
            }),
            Font({
              fontFamily: 'Roboto',
              fallbackFontFamily: 'Verdana',
              webFont: {
                url: 'https://fonts.gstatic.com/s/roboto/v27/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.woff2',
                format: 'woff2',
              },
              fontWeight: 600,
              fontStyle: 'normal',
            }),
            Row({
              children: Text({
                children: `Hello ${name} Thanks for starting the new Eliphstore account creation process. We want to make sure it's really you. Please enter the following verification code when prompted.
                 If you don't want to create an account, you can ignore this message.`,
              }),
            }),
            
            Row({
              children: Heading({
                as: "h2",
                children: otp,
              }),
              style: {
                textAlign: 'center',
                margin: "6px 0px",
                fontWeight: "bold",
                fontSize: "30px",
              }
            }),
            Hr,
            Row({
              children: Text({
                children: 'If you did not request this code, please ignore this email.',
              }),
            }),
          ],
        }),
      ],
    })
  );
};

module.exports = { VerificationEmail };

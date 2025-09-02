const express = require('express');
const path = require('path');

const app = express();
const mysql = require("mysql");
const dbconn =mysql.createConnection({
  host:"localhost", 
  database:"Dairyman",
  user:"root",
  password:"kali",
});
const bcrypt = require("bcrypt");
const salt = bcrypt.genSaltSync(13);
//middleware
app.use(express.static(path.join(__dirname, 'public')));//static files will be served from 'public' folder
app.use(express.urlencoded({ extended: true }));//to parse form data

// dbconn.query("select * from Farmers", (err, results) => {
//   console.log(err);
  
//   console.log(results);
// })


app.get('/', (req, res) => {
    //root/route/landing page/index route
  res.render('index.ejs');
}); 
//AUTHENTICATION ROUTES
app.get('/register', (req, res) => {
  res.render('register.ejs');
});

app.get('/login', (req, res) => {
  const message = req.query.message;
  if(message === "exists") {
    res.locals.message ="Email already exists.please login";
  }else if(message === "success") {
    res.locals.message ="Registration successful.please login";
  }else if(message === "invalid") {
    res.locals.message ="Invalid email or password .please try again";
  }

  res.render('login.ejs');
});

app.post("/register", (req, res) => {
  const { email, phone, password, fullname, farm_name, farm_location, county } = req.body;

  const hashedPassword = bcrypt.hashSync(password, salt);

  const insertFarmerStatement = `
    INSERT INTO Farmers(fullname, phone, email, password, farm_name, farm_location, county) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const checkEmailStatement = `SELECT email FROM Farmers WHERE email = ?`;

  dbconn.query(checkEmailStatement, [email], (sqlErr, results) => {
    if (sqlErr) {
      console.error("Check email error:", sqlErr);
      return res.status(500).send("Server error: " + sqlErr.message);
    }

    if (results.length > 0) {
      return res.redirect("/login?message=exists");
    }

    dbconn.query(
      insertFarmerStatement,
      [fullname, phone, email, hashedPassword, farm_name, farm_location, county],
      (insertError) => {
        if (insertError) {
          console.error("Insert error:", insertError);
          return res.status(500).send("Error while registering farmer: " + insertError.message);
        }
        res.redirect("/login?message=success");
      }
    );
  });
});

app.post("/login", (req, res) => {
  console.log(req.body);

  const { email, password } = req.body;

  // FIXED: removed extra comma + use placeholders
  const checkEmailStatement = `SELECT email, fullname, password FROM Farmers WHERE email = ?`;

  dbconn.query(checkEmailStatement, [email], (sqlErr, data) => {
    if (sqlErr) {
      console.error("Login SQL error:", sqlErr);
      return res.status(500).send("Server error");
    }

    if (data.length === 0) {
      return res.redirect("/login?message=invalid");
    } else {
      const user = data[0];
      console.log("User found:", user);

      const passwordMatch = bcrypt.compareSync(password, user.password); // bcrypt compare
      if (passwordMatch) {
        // create a session and redirect to dashboard
        res.redirect("/dashboard");
      } else {
        res.redirect("/login?message=invalid");
      }
    }
  });
});









app.get("/dashboard", (req, res) => {
  res.send('dashboard.ejs');   
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
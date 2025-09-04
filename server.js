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
const session = require("express-session")
const sqlQuery = require("./sqlstatement.js");
const utils = require("./utils.js");

dbconn.query(
  "SELECT * FROM Farmers where email = ?",
  ["john@example.com"],
  (err, results) => {
    console.log(results.length);
    
  }
);
//middleware
app.use(express.static(path.join(__dirname, 'public')));//static files will be served from 'public' folder
app.use(express.urlencoded({ extended: true }));//to parse form data
app.use(
  session({
    secret:"keyboardcat",
    resave: false,
    saveUninitialized: true,
  })
);
//authorization middleware
const protectedRoutes = ["/dashboard","/expenses"]
app.use((req,res,next)=>{
  if(protectedRoutes.includes(req.path)){
    //check if user is logged in
    
    if(req.session && req.session.farmer){
      res.locals.farmer = req.session.farmer;
      next()
    }else{
      res.redirect("/login?message=unauthorized")
    }
  }else{
    next()
  }
});
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
  }else if(message=="unauthorized"){
    res.locals.message ="You are unauthorized to access this page"
  }
  res.sender

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
  const checkEmailStatement = `SELECT farmer_id,email, fullname, password FROM Farmers WHERE email = ?`;

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
        req.session.farmer = user;//setting session for a farmer
        res.redirect("/dashboard");
      } else {
        res.redirect("/login?message=invalid");
      }
    }
  });
});
// console.log(bcrypt.hashSync("john123", salt));

app.get("/dashboard", (req, res) =>{
  dbconn.query(
    sqlQuery.getProductionRecordsForFarmer(req.session.farmer.farmer_id),
    (sqlErr, data) => {
      if(sqlErr) return res.status(500).send("Server error!");
      const GroupedData = utils.groupAndExtractLatest(data);
      res.render("dashboard.ejs", {GroupedData} );


      
    }
  );
  
  
});

app.get("/logout",(req,res) =>{
  req.session.destroy();
  res.redirect("/login");
});

app.listen(3000, () =>{
  console.log("server is running on port 3000");
  
});










const express = require('express');
const path = require('path');
const multer = require("multer");
const upload = multer({ dest: "public/images/" });

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
const { log } = require('console');

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
const protectedRoutes = ["/dashboard","/expenses","/animal-profiles", "/new-animal","/milk-production","/add-milk-production","/add-expense","/vaccination","/add-vaccination","/medication","/add-medication","/feed-consumption","/add-feed-consumption"];  
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

app.get("/animal-profiles", (req, res) => {
  dbconn.query(
    sqlQuery.getAnimalsProductionsForFarmer(req.session.farmer.farmer_id),
    (sqlErr, animals) => {
      if (sqlErr) return res.status(500).send("Server Error!" + sqlErr);
      console.log(utils.getChartData(animals));

      dbconn.query(
        `select * from Animal WHERE owner_id=${req.session.farmer.farmer_id}`,
        (err, allAnimalsForFarmer) => {
          if (err) return res.status(500).send("Server Error!" + err);
          res.render("animal-profiles.ejs", {
            animals: utils.getChartData(animals),
            allAnimalsForFarmer,
          });
        }
      );
    }
  );
});

app.post("/new-animal",upload.single("picture") ,(req, res) => {
  let { animal_tag, dob, purchase_date, breed, name, source, gender, status } =
    req.body;
  purchase_date.length == 0
    ? (purchase_date = "2000-01-01")
    : (purchase_date = purchase_date);
  console.log(req.body);

  const insertAnimalStatement = `INSERT INTO Animal(animal_tag,name,dob,purchase_date,breed,status,source,gender,owner_id) VALUES("${animal_tag}","${name}","${dob}","${purchase_date}","${breed}","${status}","${source}","${gender}", ${req.session.farmer.farmer_id})`;

  dbconn.query(insertAnimalStatement, (sqlErr) => {
    if (sqlErr) {
      console.log(sqlErr);
      return res.status(500).send("Server Error!" + sqlErr);
    }
    res.redirect("/animal-profiles");
  });
});

app.get("/milk-production", (req, res) => {
  const productionQuery = `
    SELECT
      Animal.animal_tag,
      Animal.name AS animal_name,
      MilkProduction.production_date,
      MilkProduction.production_time,
      quantity
    FROM MilkProduction
    JOIN Animal ON MilkProduction.animal_id = Animal.animal_tag
    JOIN Farmers ON Animal.owner_id = Farmers.farmer_id
    WHERE Farmers.farmer_id = ${req.session.farmer.farmer_id}
    ORDER BY MilkProduction.production_date DESC
    LIMIT 30;
  `;

  dbconn.query(productionQuery, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Server Error!" + err);
    }
    res.render("milk-production.ejs", {productions: results });
  });
});

app.post("/milk-production", (req, res) => {
  const { animal_id, production_date, production_time, quantity } = req.body;
  console.log(req.body);

  const insertProductionStatement = `
    INSERT INTO MilkProduction(animal_id, production_date, production_time, quantity)
    VALUES(?, ?, ?, ?)
  `;

  dbconn.query(
    insertProductionStatement,
    [animal_id, production_date, production_time, quantity],
    (sqlErr) => {
      if (sqlErr) {
        console.log(sqlErr);
        return res.status(500).send("Server Error!" + sqlErr);
      }
      res.redirect("/milk-production");
    }
  );
});   

app.get("/add-milk-production", (req, res) => {
  dbconn.query(
    `SELECT animal_tag,name FROM Animal WHERE owner_id=${req.session.farmer.farmer_id} AND status = "Alive" AND gender = "Female"`,
    (sqlErr, animals) => {
      console.log(sqlErr);
      
      res.render("add-milk-production.ejs", { animals });
    }
  );
});

app.post("/add-milk-production", (req, res) => {
  quality = quality || High;
  const { animal_id, production_date, production_time, quantity, quality } = req.body;
  console.log(req.body);

  const insertProductionStatement = `
    INSERT INTO MilkProduction(animal_id, production_date, production_time, quantity, quality)
    VALUES(?, ?, ?, ?)
  `;

  dbconn.query(
    insertProductionStatement,
    [animal_id, production_date, production_time, quantity],
    (sqlErr) => {
      if (sqlErr) {
        console.log(sqlErr);
        return res.status(500).send("Server Error!" + sqlErr);
      }
      res.redirect("/milk-production");
    }
  );
});

app.get("/expenses", (req, res) => {
  const farmerId = req.session.farmer.farmer_id;

  const totalExpensesQuery = `
    SELECT IFNULL(SUM(amount), 0) AS total
    FROM Expenses
    WHERE farmer_id = ?
  `;

  const avgDailyQuery = `
    SELECT IFNULL(SUM(amount)/30, 0) AS avgDaily
    FROM Expenses
    WHERE farmer_id = ?
      AND expense_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  `;

  const recentQuery = `
    SELECT expense_date, expense_type, description, amount
    FROM Expenses
    WHERE farmer_id = ?
    ORDER BY expense_date DESC
    LIMIT 5
  `;

  dbconn.query(totalExpensesQuery, [farmerId], (err, totalRes) => {
    if (err) return res.status(500).send("Error fetching total expenses");

    dbconn.query(avgDailyQuery, [farmerId], (err, avgRes) => {
      if (err) return res.status(500).send("Error fetching avg daily expenses");

      dbconn.query(recentQuery, [farmerId], (err, recentRes) => {
        if (err) return res.status(500).send("Error fetching recent expenses");

        res.render("expenses.ejs", {
          totalExpenses: totalRes[0].total,
          avgDailyExpenses: avgRes[0].avgDaily,
          recentExpenses: recentRes,
        });
      });
    });
  });
});

app.post("/add-expense", (req, res) => {
  const { expense_date, expense_type, description, amount } = req.body;

  if (!req.session.farmer) {
    return res.redirect("/login?message=unauthorized");
  }

  const farmer_id = req.session.farmer.farmer_id;

  const insertExpenseStatement = `
    INSERT INTO Expenses(expense_date, expense_type, description, amount, farmer_id)
    VALUES(?, ?, ?, ?, ?)
  `;

  dbconn.query(
    insertExpenseStatement,
    [expense_date, expense_type, description, amount, farmer_id],
    (err) => {
      if (err) {
        console.error("Insert expense error:", err);
        return res.status(500).send("Server Error!" + err);
      }
      req.session.successMessage = "Expense recorded successfully!";
      res.redirect("/expenses");
    }
  );
});


app.get("/vaccination", (req, res) => {
  const farmerId = req.session.farmer.farmer_id;

  const totalQuery = `
    SELECT COUNT(*) AS totalVaccinations
    FROM Vaccination v
    JOIN Animal a ON v.animal_id = a.animal_tag
    WHERE a.owner_id = ?
  `;

  const dueSoonQuery = `
    SELECT COUNT(*) AS dueSoon
    FROM Vaccination v
    JOIN Animal a ON v.animal_id = a.animal_tag
    WHERE a.owner_id = ?
      AND v.next_due_date IS NOT NULL
      AND v.next_due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
  `;

  const recentQuery = `
    SELECT v.date_administered, v.vaccine_name, v.next_due_date, v.notes,
           a.name AS animal_name, a.animal_tag
    FROM Vaccination v
    JOIN Animal a ON v.animal_id = a.animal_tag
    WHERE a.owner_id = ?
    ORDER BY v.date_administered DESC
    LIMIT 5
  `;

  dbconn.query(totalQuery, [farmerId], (err, totalRes) => {
    if (err) {
      console.error("Total vaccinations query error:", err);
      return res.status(500).send("Error fetching total vaccinations");
    }

    dbconn.query(dueSoonQuery, [farmerId], (err, dueRes) => {
      if (err) {
        console.error("Due soon query error:", err);
        return res.status(500).send("Error fetching due soon vaccinations");
      }

      dbconn.query(recentQuery, [farmerId], (err, recentRes) => {
        if (err) {
          console.error("Recent vaccinations query error:", err);
          return res.status(500).send("Error fetching recent vaccinations");
        }

        dbconn.query(
          `SELECT animal_tag, name FROM Animal WHERE owner_id = ? AND status="Alive"`,
          [farmerId],
          (err, animals) => {
            if (err) {
              console.error("Animals query error:", err);
              return res.status(500).send("Error fetching animals");
            }

            res.render("vaccination.ejs", {
              totalVaccinations: totalRes[0].totalVaccinations,
              dueSoon: dueRes[0].dueSoon,
              recentVaccinations: recentRes,
              animals
            });
          }
        );
      });
    });
  });
});

   

app.post("/add-vaccination", (req, res) => {
  const { animal_id, date_administered, vaccine_name, next_due_date, notes } = req.body;
  console.log(req.body);

  const insertVaccinationStatement = `
    INSERT INTO Vaccination(animal_id, date_administered, vaccine_name, next_due_date, notes)
    VALUES(?, ?, ?, ?, ?)
  `;

  dbconn.query(
    insertVaccinationStatement,
    [animal_id, date_administered, vaccine_name, next_due_date, notes],
    (sqlErr) => {
      if (sqlErr) {
        console.error("Insert vaccination error:", sqlErr);
        return res.status(500).send("Server Error!" + sqlErr);
      }
      res.redirect("/vaccination");
    }
  );
});

// Show medication records
// Show medication records
app.get("/medication", (req, res) => {
  const farmerId = req.session.farmer.farmer_id;

  const sql = `
    SELECT m.medication_id, m.medication_name, m.dose, m.start_date, m.end_date,
           m.veterinary_name, m.veterinary_remarks, m.notes,
           a.animal_tag, a.name AS animal_name
    FROM Medication m
    JOIN Animal a ON m.animal_id = a.animal_tag
    WHERE a.owner_id = ?
    ORDER BY m.start_date DESC
  `;

  dbconn.query(sql, [farmerId], (err, medications) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Server Error! " + err);
    }

    // Compute values for dashboard cards
    const totalMedications = medications.length;

    const activeMedications = medications.filter(med => {
      if (!med.end_date) return true; // ongoing treatment
      return new Date(med.end_date) >= new Date(); // still active
    }).length;

    const recentMedications = medications.slice(0, 5); // last 5 records

    res.render("medication.ejs", {
      medications,
      totalMedications,
      activeMedications,
      recentMedications,
      animals: [] // just in case your EJS form expects it
    });
  });
});



// Add a new medication record
app.post("/add-medication", (req, res) => {
  let { animal_id, medication_name, dose, start_date, end_date, veterinary_name, veterinary_remarks, notes } = req.body;

  // defaults
  end_date = end_date || null;
  notes = notes || "No notes provided";

  const sql = `
    INSERT INTO Medication(animal_id, medication_name, dose, start_date, end_date, veterinary_name, veterinary_remarks, notes)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `;

  dbconn.query(
    sql,
    [animal_id, medication_name, dose, start_date, end_date, veterinary_name, veterinary_remarks, notes],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Server Error! " + err);
      }
      res.redirect("/medication");
    }
  );
});



/// ============================
// Feed Consumption Management
// ============================

app.get("/feed-consumption", (req, res) => {
  const farmerId = req.session.farmer.farmer_id;

  // Queries
  const totalFeedRecordsQuery = `
    SELECT COUNT(*) as total_feed_records
    FROM FeedConsumption fc
    JOIN Animal a ON fc.animalfed = a.animal_tag
    WHERE a.owner_id = ?
  `;

  const totalFeedCostQuery = `
    SELECT IFNULL(SUM(fc.cost), 0) as total_feed_cost
    FROM FeedConsumption fc
    JOIN Animal a ON fc.animalfed = a.animal_tag
    WHERE a.owner_id = ? 
      AND fc.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  `;

  const totalQuantityQuery = `
    SELECT IFNULL(SUM(fc.quantity), 0) as total_quantity
    FROM FeedConsumption fc
    JOIN Animal a ON fc.animalfed = a.animal_tag
    WHERE a.owner_id = ?
  `;

  const avgDailyCostQuery = `
    SELECT ROUND(IFNULL(SUM(fc.cost) / 30, 0), 0) as avg_daily_cost
    FROM FeedConsumption fc
    JOIN Animal a ON fc.animalfed = a.animal_tag
    WHERE a.owner_id = ? 
      AND fc.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  `;

  const recentFeedQuery = `
    SELECT fc.id_feed, fc.animalfed, fc.quantity, fc.type, fc.cost, fc.date,
           a.name as animal_name, a.animal_tag
    FROM FeedConsumption fc
    JOIN Animal a ON fc.animalfed = a.animal_tag
    WHERE a.owner_id = ?
    ORDER BY fc.date DESC
    LIMIT 5
  `;

  const animalsQuery = `
    SELECT animal_tag, name
    FROM Animal
    WHERE owner_id = ? AND status = 'Alive'
  `;

  // Run queries in parallel
  Promise.all([
    new Promise((resolve, reject) =>
      dbconn.query(totalFeedRecordsQuery, [farmerId], (err, result) => {
        if (err) reject(err);
        else resolve(result[0].total_feed_records);
      })
    ),
    new Promise((resolve, reject) =>
      dbconn.query(totalFeedCostQuery, [farmerId], (err, result) => {
        if (err) reject(err);
        else resolve(result[0].total_feed_cost);
      })
    ),
    new Promise((resolve, reject) =>
      dbconn.query(totalQuantityQuery, [farmerId], (err, result) => {
        if (err) reject(err);
        else resolve(result[0].total_quantity);
      })
    ),
    new Promise((resolve, reject) =>
      dbconn.query(avgDailyCostQuery, [farmerId], (err, result) => {
        if (err) reject(err);
        else resolve(result[0].avg_daily_cost);
      })
    ),
    new Promise((resolve, reject) =>
      dbconn.query(recentFeedQuery, [farmerId], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      })
    ),
    new Promise((resolve, reject) =>
      dbconn.query(animalsQuery, [farmerId], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      })
    )
  ])
    .then(([totalFeedRecords, totalFeedCost, totalQuantity, avgDailyCost, recentFeed, animals]) => {
      res.render("feed-consumption.ejs", {
        totalFeedRecords,
        totalFeedCost,
        totalQuantity,
        avgDailyCost, // ✅ Pass this to EJS
        recentFeedConsumption: recentFeed,
        animals,
        successMessage: req.session.successMessage || null,
      });
      req.session.successMessage = null; // clear after showing
    })
    .catch((err) => {
      console.error("Error fetching feed consumption data:", err);
      res.status(500).send("Server Error: " + err.message);
    });
});


// Add Feed Record
app.post("/add-feed-consumption", (req, res) => {
  const { animalfed, quantity, type, cost } = req.body;

  const insertFeedQuery = `
    INSERT INTO FeedConsumption (animalfed, quantity, type, cost)
    VALUES (?, ?, ?, ?)
  `;

  dbconn.query(insertFeedQuery, [animalfed, quantity, type, cost], (err) => {
    if (err) {
      console.error("Error inserting feed record:", err);
      return res.status(500).send("Server Error: " + err.message);
    }

    req.session.successMessage = "✅ Feed consumption recorded successfully!";
    res.redirect("/feed-consumption");
  });
});



app.get("/logout",(req,res) =>{
  req.session.destroy();
  res.redirect("/login");
});

app.listen(3000, () =>{
  console.log("server is running on port 3000");
  
});










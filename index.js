const express = require("express");
const mongoose = require("mongoose");
//import {fetch} from "node-fetch";
const axios = require('axios');
const Transaction = require("./model/transactionDataSchema");
const cors = require('cors');
const moment = require("moment");


require("dotenv").config();

const app = express();
const PORT = process.env.PORT;

//middlewares
app.use(express.json());
app.use(cors());

  
  // Create an API to initialize the database
  const FetchDataAndInsert = () => {
    axios
      .get("https://s3.amazonaws.com/roxiler.com/product_transaction.json")
      .then(async (res) => {
        const data = res.data;
        const productsToInsert = data.map((item) => ({
          id: item.id,
          title: item.title,
          price: item.price,
          description: item.description,
          category: item.category,
          image: item.image,
          sold: item.sold,
          dateOfSale: item.dateOfSale,
        }));
        await Transaction.insertMany(productsToInsert);
      })
      .catch((err) => console.log(err));
  };
  

  //validate Month check
const validateMonth = (req, res, next) => {
  const { month } = req.params;
  if (month >= 1 && month <= 12) {
    next();
  } else {
    return res.send({
      status: 400,
      message: "invalid month",
      error: "month range should be in the range 1-12",
    });
  }
};

//---------------------------
const getTransactions = async (month, page, perPage, search) => {
  let transactions;
  if (month) {
    transactions = await ProductSchema.aggregate([
      {
        $sort: { id: 1 },
      },
      {
        $match: {
          $or: [
            { title: { $regex: new RegExp(search, "i") } },
            { description: { $regex: new RegExp(search, "i") } },
            { price: { $regex: new RegExp(search, "i") } },
          ],
        },
      },
    ]);
    transactions = transactions.filter((item) => {
      const dateObj = moment(item.dateOfSale);
      if (dateObj.month() + 1 == month) {
        return item;
      }
    });

    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    transactions = transactions.slice(startIndex, endIndex);
    return transactions;
  } else {
    transactions = await ProductSchema.aggregate([
      {
        $sort: { id: 1 },
      },
      {
        $match: {
          $or: [
            { title: { $regex: new RegExp(search, "i") } },
            { description: { $regex: new RegExp(search, "i") } },
            { price: { $regex: new RegExp(search, "i") } },
          ],
        },
      },
      {
        $facet: {
          data: [
            { $skip: parseInt((page - 1) * perPage) },
            { $limit: parseInt(perPage) },
          ],
        },
      },
    ]);
    return transactions[0].data;
  }
};

// API get transactions
app.get("/transactions/:month?", async (req, res) => {
  try {
    const page = req.query.page || 1;
    const perPage = req.query.perPage || 10;
    const search = req.query.search || "";
    const { month } = req.params;
    const transactions = await getTransactions(month, page, perPage, search);
    return res.send({
      status: 200,
      message: "success",
      data: transactions,
    });
  } catch (err) {
    console.log(err);
    return res.send({
      status: 400,
      message: "fail",
      error: err,
    });
  }
});

//API for statistics
app.get("/statistics/:month", validateMonth, async (req, res) => {
  try {
    const { month } = req.params;
    const AllProducts = await ProductSchema.find();
    let numberOfSoldItems = 0;
    let numberOfUnsoldItems = 0;
    let totalSaleAmount = 0;
    await AllProducts.map((item) => {
      const dateObj = moment(item.dateOfSale);
      if (dateObj.month() + 1 == month) {
        if (item.sold) {
          numberOfSoldItems++;
          totalSaleAmount += item.price;
        } else {
          numberOfUnsoldItems++;
        }
      }
    });
    return res.send({
      status: 200,
      message: "success",
      data: {
        totalSaleAmount: parseFloat(totalSaleAmount.toFixed(2)),
        numberOfSoldItems,
        numberOfUnsoldItems,
      },
    });
  } catch (err) {
    console.log(err);
    return res.send({
      status: 400,
      message: "fail",
      error: err,
    });
  }
});

//API for barChart - price ranges
app.get("/priceRanges/:month", validateMonth, async (req, res) => {
  try {
    const { month } = req.params;
    const allProducts = await ProductSchema.find();
    const priceRanges = {
      "0-100": 0,
      "101-200": 0,
      "201-300": 0,
      "301-400": 0,
      "401-500": 0,
      "501-600": 0,
      "601-700": 0,
      "701-800": 0,
      "801-900": 0,
      "901-above": 0,
    };
    allProducts.forEach((item) => {
      const dateObj = moment(item.dateOfSale);
      if (dateObj.month() + 1 == month) {
        let price = item.price;
        for (const range in priceRanges) {
          const [min, max] = range.split("-").map(Number);
          if (!max && price > min) {
            priceRanges[range]++;
            break;
          } else if (price >= min && price <= max) {
            priceRanges[range]++;
            break;
          }
        }
      }
    });
    return res.send({
      status: 200,
      message: "success",
      data: priceRanges,
    });
  } catch (err) {
    console.log(err);
    return res.send({
      status: 400,
      message: "fail",
      error: err,
    });
  }
});

//API for pie-chart - unique categories
app.get("/categories/:month", validateMonth, async (req, res) => {
  try {
    const { month } = req.params;
    const allProducts = await ProductSchema.find();
    const categories = {};
    allProducts.forEach((item) => {
      const dateObj = moment(item.dateOfSale);
      if (dateObj.month() + 1 == month) {
        let cat = item.category;
        if (!categories[cat]) {
          categories[cat] = 1;
        } else {
          categories[cat]++;
        }
      }
    });
    return res.send({
      status: 200,
      message: "success",
      data: categories,
    });
  } catch (err) {
    return res.send({
      status: 400,
      message: "fail",
      error: err,
    });
  }
});

// complete analysis for month - combining 3 APIs`
app.get("/completeAnalysis/:month", validateMonth, async (req, res) => {
  try {
    const { month } = req.params;
    const [statisticsResponse, priceRangesResponse, categoriesResponse] =
      await Promise.all([
        axios.get(`http://localhost:8001/statistics/${month}`),
        axios.get(`http://localhost:8001/priceRanges/${month}`),
        axios.get(`http://localhost:8001/categories/${month}`),
      ]);

    const statisticsData = statisticsResponse.data.data;
    const priceRangesData = priceRangesResponse.data.data;
    const categoriesData = categoriesResponse.data.data;

    return res.send({
      status: 200,
      message: "success",
      data: {
        totalSaleAmount: statisticsData.totalSaleAmount,
        numberOfSoldItems: statisticsData.numberOfSoldItems,
        numberOfUnsoldItems: statisticsData.numberOfUnsoldItems,
        categories: categoriesData,
        priceRanges: priceRangesData,
      },
    });
  } catch (err) {
    console.log(err);
    return res.send({
      status: 400,
      message: "fail",
      error: err,
    });
  }
});



//--------------------------------
  // Create an API to list all transactions
  app.get('/transactions', async (req, res) => {
    try {
      // Get the search and pagination parameters
      const search = req.query.search;
      const page = req.query.page || 1;
      const perPage = req.query.perPage || 10;
  
      // Build the MongoDB query
      let query = {};
      if (search) {
        query = {
          $or: [
            { productName: { $regex: new RegExp(search, 'i') } },
            { productDescription: { $regex: new RegExp(search, 'i') } },
            { productPrice: { $eq: Number(search) } },
          ],
        };
      }
  
      // Paginate the results
      const transactions = await Transaction.find(query).skip(perPage * (page - 1)).limit(perPage);
  
      // Send the response
      res.send(transactions);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      res.status(500).send('Internal Server Error');
    }
  });
  
  // Create an API for statistics
  app.get('/statistics/:month', async (req, res) => {
    try {
      const month = parseInt(req.params.month);
  
      // Get the total sale amount of the selected month
      const totalSaleAmount = await Transaction.aggregate([
        { $match: { $expr: { $eq: [{ $month: '$dateOfSale' }, month] } } },
        { $group: { _id: null, totalSaleAmount: { $sum: '$productPrice' } } },
      ]);
  
      // Get the total number of sold items of the selected month
      const totalSoldItems = await Transaction.aggregate([
        { $match: { $expr: { $eq: [{ $month: '$dateOfSale' }, month] } } },
        { $group: { _id: null, totalSoldItems: { $sum: '$quantity' } } },
      ]);
  
      // Get the total number of not sold items of the selected month
      const totalNotSoldItems = await Transaction.aggregate([
        { $match: { $expr: { $eq: [{ $month: '$dateOfSale' }, month] } } },
        { $group: { _id: null, totalNotSoldItems: { $sum: '$quantity' } } },
      ]);
  
      res.send({
        totalSaleAmount: totalSaleAmount[0]?.totalSaleAmount || 0,
        totalSoldItems: totalSoldItems[0]?.totalSoldItems || 0,
        totalNotSoldItems: totalNotSoldItems[0]?.totalNotSoldItems || 0,
      });
    } catch (error) {
      console.error('Error fetching statistics:', error);
      res.status(500).send('Internal Server Error');
    }
  });
  
  // Create an API for bar chart
  app.get('/bar-chart/:month', async (req, res) => {
    try {
      const month = parseInt(req.params.month);

        // Define the price ranges
    const priceRanges = [
        { min: 0, max: 100 },
        { min: 101, max: 200 },
        { min: 201, max: 300 },
        { min: 301, max: 400 },
        { min: 401, max: 500 },
        { min: 501, max: 600 },
        { min: 601, max: 700 },
        { min: 701, max: 800 },
        { min: 801, max: 900 },
        { min: 901, max: Infinity },
      ];
  
    // Array to store the results for each price range
    const barChartData = [];

    // Loop through each price range and perform $match and $group stages
    for (const range of priceRanges) {
      const matchStage = {
        $match: {
          dateOfSale: { $month: parseInt(month) }, // Convert month to integer
          productPrice: { $gte: range.min, $lt: range.max },
        },
      };

      const groupStage = {
        $group: {
          _id: null,
          count: { $sum: 1 },
        },
      };

      const result = await Transaction.aggregate([matchStage, groupStage]);
      const count = result.length > 0 ? result[0].count : 0;

      barChartData.push({
        priceRange: `${range.min}-${range.max === Infinity ? 'above' : range.max}`,
        count,
      });
    }
  
      res.send(barChartData);
    } catch (error) {
      console.error('Error fetching bar chart data:', error);
      res.status(500).send('Internal Server Error');
    }
  });
  
  // Create an API for pie chart
  app.get('/pie-chart/:month', async (req, res) => {
    try {
      const month = parseInt(req.params.month);
  
      const pieChartData = await Transaction.aggregate([
        {
          $match: {
            $expr: { $eq: [{ $month: '$dateOfSale' }, month] },
          },
        },
        {
          $group: {
            _id: '$category',
            count: { $sum: '$quantity' },
          },
        },
      ]);
  
      res.send(pieChartData);
    } catch (error) {
      console.error('Error fetching pie chart data:', error);
      res.status(500).send('Internal Server Error');
    }
  });
  
  // Create an API for combined data
  app.get('/combined-data/:month', async (req, res) => {
    try {
      const month = parseInt(req.params.month);
  
      const transactions = await Transaction.find({ dateOfSale: { $gte: new Date(2022, month - 1, 1), $lt: new Date(2022, month, 1) } });
      const statistics = await Transaction.aggregate([
        { $match: { $expr: { $eq: [{ $month: '$dateOfSale' }, month] } } },
        { $group: { _id: null, totalSaleAmount: { $sum: '$productPrice' }, totalSoldItems: { $sum: '$quantity' } } },
      ]);
  
      const barChartData = await Transaction.aggregate([
        {
          $match: {
            $expr: { $eq: [{ $month: '$dateOfSale' }, month] },
            productPrice: { $gte: 0, $lt: 100 },
          },
        },
        { $group: { _id: '0-100', count: { $sum: 1 } } },
        // Repeat the above $match and $group stages for other price ranges
        // ...
      ]);
  
      const pieChartData = await Transaction.aggregate([
        {
          $match: {
            $expr: { $eq: [{ $month: '$dateOfSale' }, month] },
          },
        },
        {
          $group: {
            _id: '$category',
            count: { $sum: '$quantity' },
          },
        },
      ]);
  
      res.send({
        transactions,
        statistics: {
          totalSaleAmount: statistics[0]?.totalSaleAmount || 0,
          totalSoldItems: statistics[0]?.totalSoldItems || 0,
        },
        barChartData,
        pieChartData,
      });
    } catch (error) {
      console.error('Error fetching combined data:', error);
      res.status(500).send('Internal Server Error');
    }
  });




mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("mongoDB is connected"))
  .catch((err) => console.log(err));

app.listen(PORT,  ()=>{
    console.log("server is running at :", PORT);
      FetchDataAndInsert();
    
})
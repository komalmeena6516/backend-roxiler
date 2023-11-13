const Mongoose = require("mongoose");
const Schema = Mongoose.Schema;

const Transaction = new Schema({
  id: {
    type: Number,
    require: true,
    unique: true
  },
  title: {
    type: String,
    require: true,
  },
  price: {
    type: Number,
    require: true,
  },
  description: {
    type: String,
  },
  category: {
    type: String,
    require: true,
  },
  image: {
    type: String,
  },
  sold: {
    type: Boolean,
    default: false,
  },
  dateOfSale: {
    type: String,
    require: true
  },
});



module.exports = Mongoose.model("Transaction", Transaction);

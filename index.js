require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const dns = require("dns");
const mongoose = require("mongoose");
const validator = require("validator");

// Basic Configuration
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/public", express.static(`${process.cwd()}/public`));

app.get("/", function (req, res) {
  res.sendFile(process.cwd() + "/views/index.html");
});

// Your first API endpoint
app.get("/api/hello", function (req, res) {
  res.json({ greeting: "hello API" });
});

app.use(express.urlencoded({ extended: true }));

const urlSchema = new mongoose.Schema({
  original_url: {
    type: String,
  },
  short_url: {
    type: Number,
  },
});

const UrlList = mongoose.model("UrlList", urlSchema);

mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("db is connected"))
  .catch((error) => handleError(error));

const validateUrlWithDns = (url) => {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname;

      dns.lookup(hostname, (err) => {
        if (err) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    } catch (error) {
      resolve(false);
    }
  });
};

app.post("/api/shorturl", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.json({ error: "Invalid URL" });
  }

  if (!validator.isURL(url, { require_protocol: true })) {
    return res.json({ error: "Invalid URL" });
  }

  try {
    const isValid = await validateUrlWithDns(url);
    if (!isValid) {
      return res.json({ error: "Invalid URL" });
    }

    // Check if the URL already exists in the database
    const existingUrl = await UrlList.findOne({ original_url: url });

    if (existingUrl) {
      return res.status(200).json({
        original_url: existingUrl.original_url,
        short_url: existingUrl.short_url,
      });
    }

    // Generate a new short URL
    const count = await UrlList.countDocuments();
    const newShortUrl = count + 1;

    // Create and save the new URL document
    const newUrl = new UrlList({
      original_url: url,
      short_url: newShortUrl,
    });

    await newUrl.save();

    res.status(201).json({
      original_url: newUrl.original_url,
      short_url: newUrl.short_url,
    });
  } catch (err) {
    console.error("Error saving URL:", err);
    res.status(500).json({ error: "Failed to process request" });
  }
});

app.get("/api/shorturl/:short_url", async (req, res) => {
  const { short_url } = req.params;

  try {
    const urlData = await UrlList.findOne({ short_url: short_url });

    if (!urlData) {
      return res.status(404).json({ error: "Short URL not found" });
    }

    res.redirect(urlData.original_url);
  } catch (err) {
    console.error("Error finding URL:", err);
    res.status(500).json({ error: "Failed to process request" });
  }
});

app.use((req, res, next) => {
  res.status(404).send("Not Found");
});

app.listen(port, function () {
  console.log(`Listening on port ${port}`);
});

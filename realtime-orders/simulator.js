"use strict";

const { Pool } = require("pg");
require("dotenv").config();

const CUSTOMER_NAMES = [
  "Alice Johnson",
  "Bob Martinez",
  "Carol White",
  "David Kim",
  "Eva Patel",
  "Frank Nguyen",
  "Grace Lee",
  "Henry Brown",
  "Isla Sharma",
  "Jack Wilson",
];

const PRODUCT_NAMES = [
  "Wireless Headphones",
  "Mechanical Keyboard",
  "USB-C Hub",
  "Standing Desk Mat",
  "Webcam HD 1080p",
  "Laptop Stand",
  "Ergonomic Mouse",
  "Monitor Light Bar",
  "Cable Management Kit",
  "Portable SSD 1TB",
];

const STATUSES = ["pending", "shipped", "delivered"];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

pool.on("error", (err) => {
  console.error("Unexpected idle client error:", err.message);
});

const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

const randomDelay = (min, max) =>
  new Promise((resolve) => setTimeout(resolve, Math.random() * (max - min) + min));

async function insertOrder() {
  const customer = randomItem(CUSTOMER_NAMES);
  const product = randomItem(PRODUCT_NAMES);

  await pool.query(
    `INSERT INTO orders (customer_name, product_name, status, updated_at)
     VALUES ($1, $2, 'pending', NOW())`,
    [customer, product]
  );
  console.log(`INSERT: ${customer} ordered ${product}`);
}

async function updateOrder() {
  const { rows } = await pool.query(
    `SELECT id, status FROM orders ORDER BY RANDOM() LIMIT 1`
  );

  if (rows.length === 0) {
    console.log("UPDATE: no orders to update yet");
    return;
  }

  const order = rows[0];

  const currentIndex = STATUSES.indexOf(order.status);
  const nextStatus = STATUSES[(currentIndex + 1) % STATUSES.length];

  await pool.query(
    `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
    [nextStatus, order.id]
  );
  console.log(`UPDATE: order #${order.id} status: ${order.status} -> ${nextStatus}`);
}

async function deleteOrder() {
  const { rows } = await pool.query(
    `SELECT id FROM orders ORDER BY RANDOM() LIMIT 1`
  );

  if (rows.length === 0) {
    console.log("DELETE: no orders to delete yet");
    return;
  }

  const { id } = rows[0];
  await pool.query(`DELETE FROM orders WHERE id = $1`, [id]);
  console.log(`DELETE: order #${id} removed`);
}

async function runSimulator() {
  console.log("Simulator started");

  for (let i = 0; i < 5; i++) {
    await insertOrder();
  }

  while (true) {
    await randomDelay(1000, 2000);

    const roll = Math.random();

    try {
      if (roll < 0.4) {
        await insertOrder();
      } else if (roll < 0.8) {
        await updateOrder();
      } else {
        await deleteOrder();
      }
    } catch (err) {
      console.error("Operation failed:", err.message);
    }
  }
}

runSimulator().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});

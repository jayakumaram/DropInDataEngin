import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import { db } from "./db.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;

// Convert Natural Language to SQL using Gemini 2.5 Flash
async function generateSQL(nlQuery) {

const schemaDescription = `
You are an AI SQL generator. Convert the user's request into a valid MySQL query for the database "daily_job_automotive".

Below is the database schema and relationships.

TABLES AND FIELDS:

1. job_category  
   - id (INT, Primary Key)  
   - name (VARCHAR)  
   Purpose: Defines different job categories like Electrical, Mechanical, Bodywork, etc.

2. job_fare  
   - id (INT, Primary Key)  
   - category_id (FK → job_category.id)  
   - job_name (VARCHAR)  
   - base_rate (DECIMAL)  
   Purpose: Stores base rates or pricing for each job type under a category.

3. resource_skill  
   - id (INT, Primary Key)  
   - skill_name (VARCHAR)  
   Purpose: List of technician or employee skills.

4. franchise  
   - id (INT, Primary Key)  
   - name (VARCHAR)  
   Purpose: Represents the franchise or business branch.

5. brand  
   - id (INT, Primary Key)  
   - name (VARCHAR)  
   Purpose: Stores vehicle brand names (e.g., Toyota, Ford, BMW).

6. location  
   - id (INT, Primary Key)  
   - name (VARCHAR)  
   - address (VARCHAR)  
   Purpose: Physical workshop or operational locations.

7. resource  
   - id (INT, Primary Key)  
   - name (VARCHAR)  
   - role (ENUM: Admin, Supervisor, Technician)  
   - skill_id (FK → resource_skill.id)  
   - location_id (FK → location.id)  
   - franchise_id (FK → franchise.id)  
   Purpose: Employee or technician master data.

8. job_card  
   - id (INT, Primary Key)  
   - jc_no (VARCHAR)  
   - job_category_id (FK → job_category.id)  
   - brand_id (FK → brand.id)  
   - assigned_to (FK → resource.id)  
   - assigned_by (FK → resource.id)  
   - start_time (DATETIME)  
   - end_time (DATETIME)  
   - status (ENUM: Pending, InProgress, Hold, Completed)  
   - remarks (VARCHAR)  
   Purpose: Represents a single job assigned to a technician for a specific vehicle or work item.

9. job_card_photo  
   - id (INT, Primary Key)  
   - job_card_id (FK → job_card.id)  
   - photo_type (ENUM: Before, After)  
   - photo_url (VARCHAR)  
   - uploaded_by (INT)  
   - uploaded_on (DATETIME)  
   Purpose: Stores before and after job photos linked to a job card.

10. qc_check  
    - id (INT, Primary Key)  
    - job_card_id (FK → job_card.id)  
    - checked_by (INT)  
    - status (ENUM: Approved, Rejected)  
    - remarks (VARCHAR)  
    - checked_on (DATETIME)  
    Purpose: Quality control verification for completed jobs.

11. delivery_order  
    - id (INT, Primary Key)  
    - job_card_id (FK → job_card.id)  
    - do_number (VARCHAR)  
    - completed_on (DATETIME)  
    - status (ENUM: Pending, Completed)  
    Purpose: Delivery record for completed jobs.

12. lpo  
    - id (INT, Primary Key)  
    - job_card_id (FK → job_card.id)  
    - lpo_number (VARCHAR)  
    - amount (DECIMAL)  
    - linked_do (FK → delivery_order.id)  
    Purpose: Local purchase order details linked to job or delivery order.

13. invoice  
    - id (INT, Primary Key)  
    - job_card_id (FK → job_card.id)  
    - invoice_no (VARCHAR)  
    - invoice_date (DATE)  
    - total_amount (DECIMAL)  
    Purpose: Billing and invoice details linked to a job card.

RELATIONSHIPS SUMMARY:
- job_fare.category_id → job_category.id  
- resource.skill_id → resource_skill.id  
- resource.location_id → location.id  
- resource.franchise_id → franchise.id  
- job_card.job_category_id → job_category.id  
- job_card.brand_id → brand.id  
- job_card.assigned_to / assigned_by → resource.id  
- job_card_photo.job_card_id → job_card.id  
- qc_check.job_card_id → job_card.id  
- delivery_order.job_card_id → job_card.id  
- lpo.job_card_id → job_card.id  
- lpo.linked_do → delivery_order.id  
- invoice.job_card_id → job_card.id

RULES:
- Output only valid MySQL syntax.
- Do not explain; return only the SQL.
- When grouping or aggregating, use proper joins and aliases.
`;



  const prompt = `${schemaDescription}\nUser: ${nlQuery}`;

  try {
    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      { contents: [{ parts: [{ text: prompt }] }] },
      { params: { key: process.env.GEMINI_API_KEY } }
    );

    const text =
      res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    if (!text) {
      console.error("Empty Gemini response:", JSON.stringify(res.data, null, 2));
      return null;
    }

    // Clean up markdown formatting
    const cleanSQL = text
      .replace(/```sql/gi, "")
      .replace(/```/g, "")
      .trim();

    console.log("🧠 Gemini generated SQL:", cleanSQL);
    return cleanSQL;
  } catch (err) {
    console.error("AI Error:", err.response?.data || err.message);
    return null;
  }
}

// POST /query → takes NL text, returns SQL + DB results
app.post("/query", async (req, res) => {
  const { nlQuery } = req.body;

  if (!nlQuery) {
    return res.status(400).json({ error: "Missing natural query" });
  }

  // Step 1: Ask Gemini for SQL
  const sqlQuery = await generateSQL(nlQuery);
  if (!sqlQuery) {
    return res.status(500).json({ error: "AI failed to generate SQL" });
  }

  // Step 2: Execute SQL on database
  try {
    const [rows] = await db.query(sqlQuery);
    res.json({ sql: sqlQuery, result: rows });
  } catch (err) {
    console.error("SQL Execution Error:", err.message);
    res.status(500).json({
      error: "SQL Execution Failed",
      details: err.message,
      sql: sqlQuery,
    });
  }
});

app.listen(PORT, () =>
  console.log(`✅ Backend running at http://localhost:${PORT}`)
);

import express from 'express';
import multer from 'multer';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ 
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) {
      return cb(new Error('Invalid file type'), false);
    }
    cb(null, true);
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors({ origin: '*' }));

// MySQL connection
const pool = mysql.createPool({
  host: 'sql7.freesqldatabase.com',
  user: 'sql7759385',
  password: 'S8QfwZ7CI3',
  database: 'sql7759385',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Function to initialize the database
async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();
    try {
      // Create applicants table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS applicants (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL,
          phone VARCHAR(20) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create videos table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS videos (
          id INT AUTO_INCREMENT PRIMARY KEY,
          applicant_id INT NOT NULL,
          video_path VARCHAR(255) NOT NULL,
          question_number INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (applicant_id) REFERENCES applicants(id)
        )
      `);
      
      console.log('Database schema initialized successfully');
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error initializing database schema:', error);
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/submit-application', upload.array('video', 3), async (req, res) => {
  console.log(req.body); // Log the form fields
  console.log(req.files); // Log the uploaded files
  
  const { name, email, phone } = req.body;
  const videos = req.files;

  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        'INSERT INTO applicants (name, email, phone) VALUES (?, ?, ?)',
        [name, email, phone]
      );

      const applicantId = result.insertId;

      for (let i = 0; i < videos.length; i++) {
        await connection.execute(
          'INSERT INTO videos (applicant_id, video_path, question_number) VALUES (?, ?, ?)',
          [applicantId, videos[i].path, i + 1]
        );
      }

      await connection.commit();
      res.status(200).json({ message: 'Application submitted successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error submitting application:', error);
    res.status(500).json({ message: 'Error submitting application' });
  }
});

app.get('/api/admin/applications', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.*, 
             GROUP_CONCAT(v.video_path) as video_paths,
             GROUP_CONCAT(v.question_number) as question_numbers
      FROM applicants a
      LEFT JOIN videos v ON a.id = v.applicant_id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ message: 'Error fetching applications' });
  }
});

app.get('/api/admin/video/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);
  res.sendFile(filePath);
});

const PORT = process.env.PORT || 8081;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initializeDatabase();
});


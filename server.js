require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();

// Database connection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10
});

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(express.static('public'));

app.set('view engine', 'ejs');

// Session
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: 1000 * 60 * 60
    }
}));

// Check database connection
app.get('/test-db', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT DATABASE() AS db_name'
        );

        res.send(
            'Connected to MySQL: ' + rows[0].db_name
        );
    } catch (error) {
        console.error(error);
        res.status(500).send('Database connection failed');
    }
});

// Home page
app.get('/', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/todos');
    }

    res.redirect('/login');
});

// Register page
app.get('/register', (req, res) => {
    res.render('register', {
        errors: [],
        name: '',
        email: ''
    });
});

// Register user
app.post('/register', async (req, res) => {
    const { name, email, password, confirm_password } = req.body;

    const errors = [];

    if (!name || !name.trim()) {
        errors.push('Name is required');
    }

    if (!email || !email.trim()) {
        errors.push('Email is required');
    }

    if (!password) {
        errors.push('Password is required');
    }

    if (!confirm_password) {
        errors.push('Confirm password is required');
    } else if (password !== confirm_password) {
        errors.push('Passwords do not match');
    }

    if (name && name.trim().length > 100) {
        errors.push('Name is too long');
    }

    if (email && email.trim().length > 255) {
        errors.push('Email is too long');
    }

    if (password && password.length > 72) {
        errors.push('Password is too long');
    }

    if (errors.length > 0) {
        return res.status(400).render('register', {
            errors,
            name: name || '',
            email: email || ''
        });
    }

    try {
        const cleanName = name.trim();
        const cleanEmail = email.trim();

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Insert user using parameters
        const [result] = await db.execute(
            `INSERT INTO users (email, name, password_hash)
             VALUES (?, ?, ?)`,
            [cleanEmail, cleanName, passwordHash]
        );

        // Log user in
        req.session.userId = result.insertId;
        req.session.userName = cleanName;

        res.redirect('/todos');

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).render('register', {
                errors: ['Email Already Exists'],
                name: name || '',
                email: email || ''
            });
        }

        console.error(error);
        res.status(500).send('Something went wrong');
    }
});

// Login page
app.get('/login', (req, res) => {
    res.render('login', {
        errors: [],
        email: ''
    });
});

// Login user
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const errors = [];

    if (!email || !email.trim()) {
        errors.push('Email is required');
    }

    if (!password) {
        errors.push('Password is required');
    }

    if (errors.length > 0) {
        return res.status(400).render('login', {
            errors,
            email: email || ''
        });
    }

    try {
        const [users] = await db.execute(
            `SELECT user_id, name, password_hash
             FROM users
             WHERE email = ?`,
            [email.trim()]
        );

        if (users.length === 0) {
            return res.status(401).render('login', {
                errors: ['Invalid email or password'],
                email: email
            });
        }

        const user = users[0];

        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).render('login', {
                errors: ['Invalid email or password'],
                email: email
            });
        }

        // Regenerate session after successful login
        req.session.regenerate((err) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Session error');
            }

            req.session.userId = user.user_id;
            req.session.userName = user.name;

            req.session.save((saveError) => {
                if (saveError) {
                    console.error(saveError);
                    return res.status(500).send('Session error');
                }

                res.redirect('/todos');
            });
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Something went wrong');
    }
});

// Logout
app.post('/logout', (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error(error);
            return res.status(500).send('Logout failed');
        }

        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

// Authentication middleware
function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    next();
}

// To-do list page
app.get('/todos', requireLogin, async (req, res) => {
    try {
        const [todos] = await db.execute(
            `SELECT todo_id, title, is_done, created_at
             FROM todos
             WHERE user_id = ?
             ORDER BY todo_id DESC`,
            [req.session.userId]
        );

        res.render('todos', {
            todos,
            userName: req.session.userName,
            errors: []
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Could not load your tasks');
    }
});

// Add to-do
app.post('/todos/add', requireLogin, async (req, res) => {
    const title = req.body.title || '';
    const cleanTitle = title.trim();

    const errors = [];

    if (!cleanTitle) {
        errors.push('Title is required');
    }

    if (cleanTitle.length > 200) {
        errors.push('Title is too long');
    }

    if (errors.length > 0) {
        return res.status(400).render('todos', {
            todos: await getTodos(req.session.userId),
            userName: req.session.userName,
            errors
        });
    }

    try {
        await db.execute(
            `INSERT INTO todos (user_id, title)
             VALUES (?, ?)`,
            [req.session.userId, cleanTitle]
        );

        res.redirect('/todos');

    } catch (error) {
        console.error(error);
        res.status(500).send('Could not add task');
    }
});

// Helper to get current user's tasks
async function getTodos(userId) {
    const [todos] = await db.execute(
        `SELECT todo_id, title, is_done, created_at
         FROM todos
         WHERE user_id = ?
         ORDER BY todo_id DESC`,
        [userId]
    );

    return todos;
}

// Edit to-do title
app.post('/todos/edit/:id', requireLogin, async (req, res) => {
    const title = req.body.title || '';
    const cleanTitle = title.trim();

    if (!cleanTitle) {
        return res.status(400).send('Title is required');
    }

    if (cleanTitle.length > 200) {
        return res.status(400).send('Title is too long');
    }

    try {
        await db.execute(
            `UPDATE todos
             SET title = ?
             WHERE todo_id = ?
             AND user_id = ?`,
            [cleanTitle, req.params.id, req.session.userId]
        );

        res.redirect('/todos');

    } catch (error) {
        console.error(error);
        res.status(500).send('Could not edit task');
    }
});

// Mark task done or not done
app.post('/todos/toggle/:id', requireLogin, async (req, res) => {
    try {
        await db.execute(
            `UPDATE todos
             SET is_done = IF(is_done = 1, 0, 1)
             WHERE todo_id = ?
             AND user_id = ?`,
            [req.params.id, req.session.userId]
        );

        res.redirect('/todos');

    } catch (error) {
        console.error(error);
        res.status(500).send('Could not update task');
    }
});

// Delete to-do
app.post('/todos/delete/:id', requireLogin, async (req, res) => {
    try {
        await db.execute(
            `DELETE FROM todos
             WHERE todo_id = ?
             AND user_id = ?`,
            [req.params.id, req.session.userId]
        );

        res.redirect('/todos');

    } catch (error) {
        console.error(error);
        res.status(500).send('Could not delete task');
    }
});

// Start server
const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const connectDB = require('./lib/db');
const Quiz = require('./models/Quiz');
const Submission = require('./models/Submission');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

async function withDB(res, fn) {
    if (!process.env.MONGODB_URI) {
        return res.status(500).json({ error: 'Database not configured. Set the MONGODB_URI environment variable in Vercel.' });
    }
    try {
        await connectDB();
        await fn();
    } catch (err) {
        console.error('[DB Error]', err.message);
        res.status(500).json({ error: err.message || 'Server error' });
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', mongoConfigured: !!process.env.MONGODB_URI });
});

app.post('/api/login', (req, res) => {
    const { username, role, password } = req.body;
    if (!username || username.trim() === '') {
        return res.status(401).json({ success: false, message: 'Please enter your full name.' });
    }
    if (role !== 'lecturer' && role !== 'student') {
        return res.status(401).json({ success: false, message: 'Please select a valid role.' });
    }
    if (role === 'lecturer') {
        const correctPassword = process.env.LECTURER_PASSWORD || 'lecturer123';
        if (!password || password !== correctPassword) {
            return res.status(401).json({ success: false, message: 'Incorrect lecturer password.' });
        }
    }
    res.json({ success: true, username: username.trim(), role });
});

app.get('/api/quizzes', (req, res) => {
    withDB(res, async () => {
        const quizzes = await Quiz.find({}, 'subjectName');
        res.json(quizzes.map(q => ({ id: q.id, subjectName: q.subjectName })));
    });
});

app.post('/api/quizzes', (req, res) => {
    withDB(res, async () => {
        const { subjectName, durationValue, timeUnit, questions } = req.body;
        if (!subjectName || !questions || questions.length === 0) {
            return res.status(400).json({ error: 'Subject name and at least one question are required.' });
        }

        let durationInSeconds = parseInt(durationValue) || 600;
        if (timeUnit === 'minutes') durationInSeconds *= 60;
        if (timeUnit === 'hours') durationInSeconds *= 3600;

        const optionMap = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };

        const quiz = await Quiz.create({
            subjectName,
            durationInSeconds,
            questions: questions.map((q, idx) => ({
                id: `q${idx}`,
                text: q.text,
                options: q.options,
                correctOptionText: q.options[optionMap[q.correctOptionLetter]]
            }))
        });

        res.json({ success: true, quizId: quiz.id, subjectName: quiz.subjectName });
    });
});

app.get('/api/quizzes/:id', (req, res) => {
    withDB(res, async () => {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) return res.status(404).json({ error: 'Subject not found.' });

        const username = req.query.username;
        const previousAttempt = await Submission.findOne({ quizId: req.params.id, username });
        if (previousAttempt) {
            return res.json({ alreadyTaken: true, result: previousAttempt });
        }

        const shuffledQuestions = shuffleArray([...quiz.questions]).map(q => {
            const optionsWithFlag = q.options.map(opt => ({ text: opt, isCorrect: opt === q.correctOptionText }));
            shuffleArray(optionsWithFlag);
            return { id: q.id, text: q.text, options: optionsWithFlag.map(o => o.text) };
        });

        res.json({
            id: quiz.id,
            subjectName: quiz.subjectName,
            durationInSeconds: quiz.durationInSeconds,
            questions: shuffledQuestions
        });
    });
});

app.post('/api/submit', (req, res) => {
    withDB(res, async () => {
        const { quizId, username, answers } = req.body;
        if (!quizId || !username) {
            return res.status(400).json({ error: 'Missing quizId or username.' });
        }

        const quiz = await Quiz.findById(quizId);
        if (!quiz) return res.status(404).json({ error: 'Subject not found.' });

        let score = 0;
        const totalQuestions = quiz.questions.length;

        const gradedAnswers = (answers || []).map(ans => {
            const question = quiz.questions.find(q => q.id === ans.questionId);
            if (!question) return null;
            const isCorrect = ans.selectedOptionText === question.correctOptionText;
            if (isCorrect) score++;
            return {
                questionId: ans.questionId,
                questionText: question.text,
                studentAnswer: ans.selectedOptionText,
                correctAnswer: question.correctOptionText,
                isCorrect
            };
        }).filter(Boolean);

        const submission = await Submission.create({
            quizId,
            subjectName: quiz.subjectName,
            username,
            score,
            totalQuestions,
            percentage: Math.round((score / totalQuestions) * 100),
            gradedAnswers,
            submittedAt: new Date()
        });

        res.json({ success: true, result: submission });
    });
});

app.get('/api/submissions/:quizId', (req, res) => {
    withDB(res, async () => {
        const submissions = await Submission.find({ quizId: req.params.quizId });
        res.json(submissions);
    });
});

app.delete('/api/quizzes/:id', (req, res) => {
    withDB(res, async () => {
        const quiz = await Quiz.findByIdAndDelete(req.params.id);
        if (!quiz) return res.status(404).json({ error: 'Subject not found.' });
        await Submission.deleteMany({ quizId: req.params.id });
        res.json({ success: true, subjectName: quiz.subjectName });
    });
});

if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}

module.exports = app;

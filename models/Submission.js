const mongoose = require('mongoose');

const gradedAnswerSchema = new mongoose.Schema({
    questionId: String,
    questionText: String,
    studentAnswer: String,
    correctAnswer: String,
    isCorrect: Boolean
}, { _id: false });

const submissionSchema = new mongoose.Schema({
    quizId: { type: String, required: true },
    subjectName: String,
    username: String,
    score: Number,
    totalQuestions: Number,
    percentage: Number,
    gradedAnswers: [gradedAnswerSchema],
    submittedAt: { type: Date, default: Date.now }
});

submissionSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.models.Submission || mongoose.model('Submission', submissionSchema);

const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    id: String,
    text: String,
    options: [String],
    correctOptionText: String
}, { _id: false });

const quizSchema = new mongoose.Schema({
    subjectName: { type: String, required: true },
    durationInSeconds: { type: Number, required: true },
    questions: [questionSchema]
});

quizSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.models.Quiz || mongoose.model('Quiz', quizSchema);

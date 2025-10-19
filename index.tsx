import React, { useState, useCallback, FormEvent, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

const API_KEY = process.env.API_KEY;

// Simple validation
if (!API_KEY) {
  document.body.innerHTML = `
    <div style="font-family: sans-serif; padding: 2rem; text-align: center;">
      <h1>API Key Not Found</h1>
      <p>Please provide a valid API key to use the application.</p>
    </div>
  `;
  throw new Error("API Key not found");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const QUIZ_LENGTH = 5;

type QuizState = 'idle' | 'loading' | 'active' | 'feedback' | 'finished';
type Category = 'Arithmetic' | 'Geometry' | 'Algebra' | 'Mixed';
type Difficulty = 'Easy' | 'Medium' | 'Hard';

interface Question {
  question: string;
  answer: string;
}

interface HighScore {
    score: number;
    category: Category;
    difficulty: Difficulty;
    date: number;
}

const App: React.FC = () => {
  const [quizState, setQuizState] = useState<QuizState>('idle');
  const [category, setCategory] = useState<Category | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; correct: boolean } | null>(null);
  const [score, setScore] = useState(0);
  const [hintCoins, setHintCoins] = useState(3);
  const [hint, setHint] = useState<string | null>(null);
  const [isHintLoading, setIsHintLoading] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [highScores, setHighScores] = useState<HighScore[]>([]);
  const [scoreSaved, setScoreSaved] = useState(false);

  useEffect(() => {
    try {
        const savedScores = localStorage.getItem('mathQuizHighScores');
        if (savedScores) {
            setHighScores(JSON.parse(savedScores));
        }
    } catch (error) {
        console.error("Failed to load high scores from localStorage", error);
    }
  }, []);

  const generateQuestions = useCallback(async (selectedCategory: Category, selectedDifficulty: Difficulty) => {
    setQuizState('loading');
    setDifficulty(selectedDifficulty);

    const prompt = `Generate ${QUIZ_LENGTH} math quiz questions for a middle school student on the topic of ${selectedCategory} with a difficulty of ${selectedDifficulty}.
    For each question, provide a clear question and a concise, numerical or single-word answer.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                    questions: {
                        type: Type.ARRAY,
                        description: `An array of ${QUIZ_LENGTH} quiz questions.`,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            question: {
                              type: Type.STRING,
                              description: 'The math question.',
                            },
                            answer: {
                              type: Type.STRING,
                              description: 'The answer to the question.',
                            },
                          },
                          required: ["question", "answer"],
                        },
                      },
                },
                required: ["questions"],
              },
           },
        });

      const responseJson = JSON.parse(response.text);
      if (responseJson.questions && responseJson.questions.length > 0) {
        setQuestions(responseJson.questions);
        setQuizState('active');
      } else {
        throw new Error("Invalid response format from API.");
      }
    } catch (error) {
      console.error("Error generating questions:", error);
      alert("Sorry, there was an error generating the quiz. Please try again.");
      resetQuiz();
    }
  }, []);

  const handleCategorySelect = (selectedCategory: Category) => {
    setCategory(selectedCategory);
  };
  
  const handleGetHint = async () => {
    if (hintCoins <= 0 || hintUsed) return;

    setIsHintLoading(true);
    setHintUsed(true);
    setHintCoins(prev => prev - 1);

    const prompt = `Provide a simple, one-sentence hint for the following math problem. Do not give the answer. Problem: "${questions[currentQuestionIndex].question}"`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        setHint(response.text);
    } catch (error) {
        console.error("Error getting hint:", error);
        setHint("Sorry, couldn't get a hint right now.");
    } finally {
        setIsHintLoading(false);
    }
  };

  const handleAnswerSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!userAnswer.trim()) return;

    const correctAnswer = questions[currentQuestionIndex].answer;
    // Normalize answers for comparison
    const isCorrect = userAnswer.trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
    
    if (isCorrect) {
      setScore(prev => prev + 1);
      setFeedback({ message: 'Correct!', correct: true });
    } else {
      setFeedback({ message: `Incorrect! The answer is ${correctAnswer}`, correct: false });
    }
    setQuizState('feedback');
  };

  const handleNextQuestion = () => {
    setFeedback(null);
    setUserAnswer('');
    setHint(null);
    setHintUsed(false);
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setQuizState('active');
    } else {
      setQuizState('finished');
    }
  };
  
  const resetQuiz = () => {
    setQuizState('idle');
    setCategory(null);
    setDifficulty(null);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setUserAnswer('');
    setFeedback(null);
    setScore(0);
    setHintCoins(3);
    setHint(null);
    setHintUsed(false);
    setScoreSaved(false);
  };

  const handleSaveScore = () => {
    if (!category || !difficulty) return;
    const newScore: HighScore = { score, category, difficulty, date: Date.now() };
    const updatedScores = [...highScores, newScore]
      .sort((a, b) => b.score - a.score || b.date - a.date) // Sort by score, then by date
      .slice(0, 10); // Keep top 10
    
    setHighScores(updatedScores);
    localStorage.setItem('mathQuizHighScores', JSON.stringify(updatedScores));
    setScoreSaved(true);
  };

  const handleClearScores = () => {
    setHighScores([]);
    localStorage.removeItem('mathQuizHighScores');
  };
  
  const renderContent = () => {
    switch (quizState) {
      case 'loading':
        return (
          <>
            <h2>Generating your {difficulty} {category} quiz...</h2>
            <div className="loader"></div>
            <p>Please wait a moment.</p>
          </>
        );
      case 'active':
      case 'feedback':
        const currentQuestion = questions[currentQuestionIndex];
        return (
          <div className="quiz-view">
            <div className="score-header">
                <span>{category} ({difficulty})</span>
                <div className="stats-group">
                    <span className="hint-coins" aria-label={`${hintCoins} hints remaining`}>💡 {hintCoins}</span>
                    <span className="score-display">Score: {score} / {QUIZ_LENGTH}</span>
                </div>
            </div>
            <div className="question-card" aria-live="polite">
                {currentQuestion.question}
            </div>

            {isHintLoading && <div className="hint-feedback">Getting hint...</div>}
            {hint && <div className="hint-feedback" role="status">{hint}</div>}

            {quizState === 'active' && (
                <form onSubmit={handleAnswerSubmit}>
                    <input
                        type="text"
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        placeholder="Type your answer here"
                        aria-label="Your answer"
                        autoFocus
                    />
                    <div className="button-group">
                         <button 
                            type="button" 
                            onClick={handleGetHint} 
                            disabled={hintCoins <= 0 || hintUsed || isHintLoading}
                            className="hint-button"
                        >
                            Get Hint
                        </button>
                        <button type="submit" disabled={!userAnswer.trim()}>Submit</button>
                    </div>
                </form>
            )}
            {quizState === 'feedback' && feedback && (
                 <div className={`feedback ${feedback.correct ? 'correct' : 'incorrect'}`} role="alert">
                    {feedback.message}
                 </div>
            )}
            {quizState === 'feedback' && (
                <button onClick={handleNextQuestion}>
                    {currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'Finish Quiz'}
                </button>
            )}
          </div>
        );
      case 'finished':
          return (
            <div className="results-screen">
                <h2>Quiz Complete!</h2>
                <p>Your final score is</p>
                <h2>{score} out of {QUIZ_LENGTH}</h2>
                <div className="button-group">
                    <button onClick={handleSaveScore} disabled={scoreSaved} className="save-button">
                        {scoreSaved ? 'Score Saved!' : 'Save Score'}
                    </button>
                    <button onClick={resetQuiz}>Play Again</button>
                </div>
            </div>
          );
      case 'idle':
      default:
        if (!category) {
            return (
              <div className="category-selection">
                <h1>MATHION</h1>
                
                {highScores.length > 0 && (
                    <div className="high-scores-container">
                        <h3>High Scores</h3>
                        <ol className="high-scores-list">
                            {highScores.map((s, index) => (
                                <li key={s.date + '-' + index} className="score-item">
                                    <span>{s.category} ({s.difficulty})</span>
                                    <strong>{s.score}/{QUIZ_LENGTH}</strong>
                                </li>
                            ))}
                        </ol>
                        <button onClick={handleClearScores} className="clear-scores-button">Clear Scores</button>
                    </div>
                )}
                
                <h2>Choose a category to start!</h2>
                <div className="category-grid">
                    <button onClick={() => handleCategorySelect('Arithmetic')}>Arithmetic</button>
                    <button onClick={() => handleCategorySelect('Geometry')}>Geometry</button>
                    <button onClick={() => handleCategorySelect('Algebra')}>Algebra</button>
                    <button onClick={() => handleCategorySelect('Mixed')}>Mixed</button>
                </div>
              </div>
            );
        } else {
            return (
                <div className="difficulty-selection">
                    <h1>{category}</h1>
                    <h2>Select a difficulty level</h2>
                    <div className="difficulty-grid">
                        <button onClick={() => generateQuestions(category, 'Easy')}>Easy</button>
                        <button onClick={() => generateQuestions(category, 'Medium')}>Medium</button>
                        <button onClick={() => generateQuestions(category, 'Hard')}>Hard</button>
                    </div>
                    <button className="back-button" onClick={() => setCategory(null)}>Back to Categories</button>
                </div>
            );
        }
    }
  }

  return (
    <div className="app-container">
      {renderContent()}
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
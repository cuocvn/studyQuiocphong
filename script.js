// Initialize pdf.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
}

// App State
let state = {
    questions: [],
    stats: {
        attempts: 0,
        correct: 0,
        wrong: 0,
        bestExamScore: null,
        sessionsCount: 0
    },
    history: [], // Array of { date, correct, wrong, accuracy }
    bookmarks: [], // Array of question IDs
    incorrectQuestions: [], // Array of question IDs
    leitnerLevels: {}, // Map of questionId -> level (0 to 5)
    streak: 0,
    lastActiveDate: null, // YYYY-MM-DD
    dailyGoal: 20,
    dailyCount: 0,
    dailyDate: null, // YYYY-MM-DD
    timeTracking: {}, // Map of questionId -> { totalTime: ms, count: number, wrongCount: number }
    theme: 'dark'
};

// Current Session State variables
let currentView = 'dashboard-view';
let activeQuestion = null;
let activeQuestionIndex = 0;
let practiceList = [];
let shuffledOptions = [];
let correctOptionIndexInShuffled = 0;
let questionStartTime = 0;
let questionTimerInterval = null;
let currentQuestionTimeElapsed = 0; // in seconds

// Exam Session variables
let examQuestions = [];
let examActiveIndex = 0;
let examSelectedAnswers = []; // index matches examQuestions, value is selected index
let examTimer = null;
let examSecondsRemaining = 0;
let examTotalSeconds = 0;

// Memorize Session variables
let memorizeList = [];
let memorizeActiveIndex = 0;

// Mistakes Session variables
let mistakesList = [];
let mistakesActiveIndex = 0;

// DOM Elements
const views = document.querySelectorAll('.view-section');
const navItems = document.querySelectorAll('.nav-item');
const themeCheckbox = document.getElementById('theme-checkbox');
const body = document.body;

// Chart references
let accuracyChart = null;
let ratioChart = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    loadStateFromStorage();
    initTheme();
    initDateTimeDisplay();
    setupNavigation();
    setupThemeToggle();
    setupPDFImport();
    setupBackupRestore();
    setupBookmarksPractice();
    setupExamEvents();
    
    // Load default questions if localStorage is empty
    if (!state.questions || state.questions.length === 0) {
        fetchDefaultQuestions();
    } else {
        initAppAfterQuestionsLoaded();
    }
});

// Load and Save State
function loadStateFromStorage() {
    const savedState = localStorage.getItem('qp_quiz_state');
    if (savedState) {
        try {
            const parsed = JSON.parse(savedState);
            state = { ...state, ...parsed };
            // Standardize collections
            if (!Array.isArray(state.bookmarks)) state.bookmarks = [];
            if (!Array.isArray(state.incorrectQuestions)) state.incorrectQuestions = [];
            if (!state.stats) state.stats = { attempts: 0, correct: 0, wrong: 0, bestExamScore: null, sessionsCount: 0 };
            if (!Array.isArray(state.history)) state.history = [];
            if (!state.leitnerLevels) state.leitnerLevels = {};
            if (!state.timeTracking) state.timeTracking = {};
        } catch (e) {
            console.error('Lỗi phân tích dữ liệu đã lưu:', e);
        }
    }
}

function saveStateToStorage() {
    localStorage.setItem('qp_quiz_state', JSON.stringify(state));
}

// Fetch default questions
async function fetchDefaultQuestions() {
    try {
        const response = await fetch('questions.json');
        if (response.ok) {
            const data = await response.json();
            state.questions = data;
            saveStateToStorage();
            initAppAfterQuestionsLoaded();
        } else {
            console.warn('Không tìm thấy tệp questions.json mặc định.');
            showToast('Không có sẵn ngân hàng câu hỏi. Vui lòng tải lên tệp PDF.', 'warning');
            initAppAfterQuestionsLoaded();
        }
    } catch (e) {
        console.error('Lỗi khi tải câu hỏi mặc định:', e);
        showToast('Không thể tải câu hỏi mặc định.', 'danger');
        initAppAfterQuestionsLoaded();
    }
}

function initAppAfterQuestionsLoaded() {
    checkAndUpdateStreak();
    renderDashboard();
    initSearchFilter();
    updateSidebarStreakDisplay();
}

// Helper to show toasts (reusable floating alerts)
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast-alert glass ${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fa-solid ${getToastIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Append container if not exists
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function getToastIcon(type) {
    switch (type) {
        case 'success': return 'fa-circle-check text-success';
        case 'danger': return 'fa-circle-xmark text-danger';
        case 'warning': return 'fa-triangle-exclamation text-warning';
        default: return 'fa-circle-info text-primary';
    }
}

// Theme setup
function initTheme() {
    if (state.theme === 'light') {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        themeCheckbox.checked = false;
        document.querySelector('.theme-label').innerHTML = '<i class="fa-solid fa-sun text-warning"></i> Giao diện sáng';
    } else {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
        themeCheckbox.checked = true;
        document.querySelector('.theme-label').innerHTML = '<i class="fa-solid fa-moon"></i> Giao diện tối';
    }
}

function setupThemeToggle() {
    themeCheckbox.addEventListener('change', () => {
        if (themeCheckbox.checked) {
            state.theme = 'dark';
            body.classList.remove('light-mode');
            body.classList.add('dark-mode');
            document.querySelector('.theme-label').innerHTML = '<i class="fa-solid fa-moon"></i> Giao diện tối';
        } else {
            state.theme = 'light';
            body.classList.remove('dark-mode');
            body.classList.add('light-mode');
            document.querySelector('.theme-label').innerHTML = '<i class="fa-solid fa-sun text-warning"></i> Giao diện sáng';
        }
        saveStateToStorage();
        // Redraw charts with new colors if dashboard is active
        if (currentView === 'dashboard-view') {
            renderDashboardCharts();
        }
    });
}

// navigation
function setupNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-target');
            switchView(target);
            
            // Close mobile menu if open
            document.querySelector('.sidebar').classList.remove('mobile-open');
        });
    });
    
    document.getElementById('menu-toggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('mobile-open');
    });
}

function switchView(targetId) {
    // Stop timers from other screens
    clearInterval(questionTimerInterval);
    
    views.forEach(view => {
        view.classList.remove('active');
    });
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-target') === targetId) {
            item.classList.add('active');
        }
    });
    
    const targetView = document.getElementById(targetId);
    if (targetView) {
        targetView.classList.add('active');
        currentView = targetId;
        
        // Update header title
        const menuText = document.querySelector(`.nav-item[data-target="${targetId}"] span`).innerText;
        document.getElementById('view-title').innerText = menuText;
        
        // View-specific loaders
        if (targetId === 'dashboard-view') {
            renderDashboard();
        } else if (targetId === 'practice-view') {
            startPracticeMode();
        } else if (targetId === 'memorize-view') {
            startMemorizeMode();
        } else if (targetId === 'exam-view') {
            renderExamConfig();
        } else if (targetId === 'mistakes-view') {
            startMistakesMode();
        } else if (targetId === 'bookmarks-view') {
            renderBookmarks();
        } else if (targetId === 'search-view') {
            renderSearchList();
        } else if (targetId === 'settings-view') {
            renderSettingsPanel();
        }
    }
}

// Display Clock top bar
function initDateTimeDisplay() {
    const timeDisplay = document.getElementById('current-time-display');
    function updateClock() {
        const now = new Date();
        const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        timeDisplay.innerText = `${dateStr} - ${timeStr}`;
    }
    updateClock();
    setInterval(updateClock, 1000);
}

// Streaks and Goal Tracking logic
function checkAndUpdateStreak() {
    const today = new Date().toISOString().split('T')[0];
    
    if (state.lastActiveDate) {
        const lastActive = new Date(state.lastActiveDate);
        const currentDate = new Date(today);
        const diffTime = Math.abs(currentDate - lastActive);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
            // Consecutive day, maintain/increment streak (it increments when they answer questions)
        } else if (diffDays > 1) {
            // Streak broken
            state.streak = 0;
        }
    } else {
        state.streak = 0;
    }
    
    // Reset daily count if day changed
    if (state.dailyDate !== today) {
        state.dailyDate = today;
        state.dailyCount = 0;
    }
    
    saveStateToStorage();
    updateGoalDisplay();
}

function incrementDailyProgress() {
    const today = new Date().toISOString().split('T')[0];
    
    if (state.dailyDate !== today) {
        state.dailyDate = today;
        state.dailyCount = 0;
    }
    
    state.dailyCount++;
    
    // Update streak if active date is not today
    if (state.lastActiveDate !== today) {
        state.lastActiveDate = today;
        state.streak++;
        updateSidebarStreakDisplay();
        showToast(`Chúc mừng! Bạn duy trì chuỗi học tập ${state.streak} ngày!`, 'success');
    }
    
    saveStateToStorage();
    updateGoalDisplay();
}

function updateGoalDisplay() {
    document.getElementById('daily-goal-count').innerText = `${state.dailyCount}/${state.dailyGoal}`;
    const percent = Math.min(100, (state.dailyCount / state.dailyGoal) * 100);
    document.getElementById('daily-goal-bar').style.width = `${percent}%`;
}

function updateSidebarStreakDisplay() {
    document.getElementById('streak-count').innerText = state.streak;
}

// Group questions by lesson
function getQuestionsByLesson() {
    const groups = {};
    state.questions.forEach(q => {
        const lesson = q.lesson || 'BÀI 1';
        if (!groups[lesson]) groups[lesson] = [];
        groups[lesson].push(q);
    });
    return groups;
}

// Dashboard rendering
function renderDashboard() {
    // 1. Update metric values
    const totalQ = state.questions.length;
    document.getElementById('stat-total-questions').innerText = totalQ;
    
    // Completion rate = count of questions with Leitner Level >= 1
    const masteredCount = Object.keys(state.leitnerLevels).filter(id => state.leitnerLevels[id] >= 1).length;
    const completionRate = totalQ > 0 ? Math.round((masteredCount / totalQ) * 100) : 0;
    document.getElementById('stat-completion-rate').innerText = `${completionRate}%`;
    
    document.getElementById('stat-best-score').innerText = state.stats.bestExamScore !== null ? `${state.stats.bestExamScore}%` : 'N/A';
    document.getElementById('stat-total-sessions').innerText = state.stats.sessionsCount;
    
    // 2. Render Heatmap
    renderHeatmap();
    
    // 3. Render insights and lists
    renderInsights();
    renderRecentlyMissed();
    
    // 4. Render Charts
    renderDashboardCharts();
}

function renderHeatmap() {
    const grid = document.getElementById('heatmap-grid');
    grid.innerHTML = '';
    
    const groups = getQuestionsByLesson();
    
    // We assume there are lessons numbered 1 to 13 (or based on dynamic data)
    // Order them numerically by Lesson name
    const sortedLessons = Object.keys(groups).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numA - numB;
    });
    
    sortedLessons.forEach(lesson => {
        const list = groups[lesson];
        let totalAttempts = 0;
        let correctAttempts = 0;
        let questionsAttempted = 0;
        
        list.forEach(q => {
            const track = state.timeTracking[q.id];
            if (track && track.count > 0) {
                questionsAttempted++;
                totalAttempts += track.count;
                // incorrect counts are stored, correct = count - wrongCount
                const wrong = track.wrongCount || 0;
                correctAttempts += Math.max(0, track.count - wrong);
            }
        });
        
        const accuracy = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : null;
        
        // Define color level based on accuracy
        let levelClass = 'h-level-0'; // Unplayed
        if (accuracy !== null) {
            if (accuracy < 40) levelClass = 'h-level-1';
            else if (accuracy < 75) levelClass = 'h-level-2';
            else if (accuracy < 95) levelClass = 'h-level-3';
            else levelClass = 'h-level-4';
        }
        
        const block = document.createElement('div');
        block.className = `heatmap-block ${levelClass}`;
        block.innerHTML = `
            <span class="block-label">${lesson}</span>
            <span class="block-percent">${accuracy !== null ? accuracy + '%' : '--'}</span>
        `;
        block.title = `${lesson}: ${questionsAttempted}/${list.length} câu đã học. Độ chính xác: ${accuracy !== null ? accuracy + '%' : 'chưa thi'}`;
        
        // Click to practice this lesson specifically
        block.addEventListener('click', () => {
            switchView('practice-view');
            startPracticeMode(lesson);
        });
        
        grid.appendChild(block);
    });
}

function renderInsights() {
    const groups = getQuestionsByLesson();
    const insights = [];
    
    Object.keys(groups).forEach(lesson => {
        let totalAttempts = 0;
        let correctAttempts = 0;
        groups[lesson].forEach(q => {
            const track = state.timeTracking[q.id];
            if (track && track.count > 0) {
                totalAttempts += track.count;
                const wrong = track.wrongCount || 0;
                correctAttempts += Math.max(0, track.count - wrong);
            }
        });
        if (totalAttempts > 0) {
            insights.push({
                lesson,
                accuracy: Math.round((correctAttempts / totalAttempts) * 100),
                total: totalAttempts
            });
        }
    });
    
    const strongList = document.getElementById('strong-topics-list');
    const weakList = document.getElementById('weak-topics-list');
    
    strongList.innerHTML = '';
    weakList.innerHTML = '';
    
    if (insights.length === 0) {
        strongList.innerHTML = '<li>Chưa có dữ liệu học tập</li>';
        weakList.innerHTML = '<li>Chưa có dữ liệu học tập</li>';
        return;
    }
    
    // Sort lessons by accuracy
    const sorted = [...insights].sort((a, b) => b.accuracy - a.accuracy);
    
    // Strongest (top 3)
    const strongs = sorted.slice(0, 3).filter(x => x.accuracy >= 60);
    if (strongs.length > 0) {
        strongs.forEach(x => {
            strongList.innerHTML += `<li><span>${x.lesson}</span><strong>${x.accuracy}% đúng</strong></li>`;
        });
    } else {
        strongList.innerHTML = '<li>Chưa có thế mạnh nổi bật</li>';
    }
    
    // Weakest (bottom 3)
    const weaks = [...sorted].reverse().slice(0, 3).filter(x => x.accuracy < 85);
    if (weaks.length > 0) {
        weaks.forEach(x => {
            weakList.innerHTML += `<li><span>${x.lesson}</span><strong>${x.accuracy}% đúng</strong></li>`;
        });
    } else {
        weakList.innerHTML = '<li>Tất cả các bài đều làm rất tốt!</li>';
    }
}

function renderRecentlyMissed() {
    const tbody = document.getElementById('recently-missed-tbody');
    tbody.innerHTML = '';
    
    // Get last 5 incorrect questions
    const list = state.incorrectQuestions.slice(-5).reverse();
    
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Tuyệt vời! Bạn chưa trả lời sai câu nào gần đây.</td></tr>';
        return;
    }
    
    list.forEach(qId => {
        const q = state.questions.find(item => item.id === qId);
        if (q) {
            const track = state.timeTracking[qId];
            const fails = track ? track.wrongCount : 1;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${q.id}</strong></td>
                <td><span class="truncate-text" title="${q.question}">${q.question}</span></td>
                <td><span class="badge bg-danger">${fails} lần sai</span></td>
                <td><button class="btn primary btn-xs" onclick="practiceSingleQuestion('${q.id}')"><i class="fa-solid fa-play"></i></button></td>
            `;
            tbody.appendChild(tr);
        }
    });
}

// Render single question specifically
function practiceSingleQuestion(qId) {
    switchView('practice-view');
    const index = state.questions.findIndex(q => q.id === qId);
    if (index !== -1) {
        practiceList = [state.questions[index]];
        activeQuestionIndex = 0;
        loadPracticeQuestion();
    }
}

// Chart.js Visualization
function renderDashboardCharts() {
    const isDark = !body.classList.contains('light-mode');
    const textColor = isDark ? '#94a3b8' : '#475569';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    
    // Destroy existing charts to reload
    if (accuracyChart) accuracyChart.destroy();
    if (ratioChart) ratioChart.destroy();
    
    // Data 1: Accuracy over time
    const historyData = state.history.slice(-10); // last 10 sessions
    const labels = historyData.map(h => h.date);
    const accuracies = historyData.map(h => h.accuracy);
    
    const ctx1 = document.getElementById('accuracyHistoryChart').getContext('2d');
    accuracyChart = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: labels.length > 0 ? labels : ['Chưa thi'],
            datasets: [{
                label: 'Tỉ lệ đúng (%)',
                data: accuracies.length > 0 ? accuracies : [0],
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#3b82f6',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'Độ chính xác qua các phiên', color: textColor, font: { family: 'Outfit', size: 13, weight: '600' } }
            },
            scales: {
                x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Outfit' } } },
                y: { min: 0, max: 100, grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Outfit' } } }
            }
        }
    });
    
    // Data 2: Ratio Chart (Correct vs Wrong)
    const totalCorrect = state.stats.correct;
    const totalWrong = state.stats.wrong;
    
    const ctx2 = document.getElementById('ratioChart').getContext('2d');
    ratioChart = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: ['Đúng', 'Sai'],
            datasets: [{
                data: [totalCorrect || 1, totalWrong || 0],
                backgroundColor: ['#10b981', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Outfit', size: 11 } } },
                title: { display: true, text: 'Tổng số câu Trả lời Đúng vs Sai', color: textColor, font: { family: 'Outfit', size: 13, weight: '600' } }
            },
            cutout: '65%'
        }
    });
}

// ---------------- PRACTICE MODE ----------------
function startPracticeMode(lessonFilter = null) {
    clearInterval(questionTimerInterval);
    
    const randomCheckbox = document.getElementById('practice-random-checkbox');
    const isRandom = randomCheckbox.checked;
    
    // Filter questions
    let pool = [...state.questions];
    if (lessonFilter) {
        pool = pool.filter(q => q.lesson === lessonFilter);
    }
    
    if (pool.length === 0) {
        showToast('Không tìm thấy câu hỏi nào thỏa mãn điều kiện.', 'warning');
        return;
    }
    
    // Spaced repetition prioritization:
    // If in random mode, prioritize lower Leitner levels or wrong questions
    if (isRandom) {
        // Shuffle the pool based on weights: level 0 & incorrect get 3x chance, others 1x
        const weightedPool = [];
        pool.forEach(q => {
            const level = state.leitnerLevels[q.id] || 0;
            const isWrong = state.incorrectQuestions.includes(q.id);
            const weight = (level === 0 || isWrong) ? 4 : 1;
            for (let i = 0; i < weight; i++) {
                weightedPool.push(q);
            }
        });
        
        // Pick unique questions from the weighted selection
        const shuffledList = [];
        const seenIds = new Set();
        while (shuffledList.length < pool.length && weightedPool.length > 0) {
            const randIdx = Math.floor(Math.random() * weightedPool.length);
            const q = weightedPool[randIdx];
            if (!seenIds.has(q.id)) {
                shuffledList.push(q);
                seenIds.add(q.id);
            }
            weightedPool.splice(randIdx, 1);
        }
        practiceList = shuffledList;
    } else {
        // Sequential order
        practiceList = pool.sort((a, b) => {
            const numA = a.id.split('.').map(Number);
            const numB = b.id.split('.').map(Number);
            for (let k = 0; k < Math.max(numA.length, numB.length); k++) {
                if ((numA[k] || 0) !== (numB[k] || 0)) return (numA[k] || 0) - (numB[k] || 0);
            }
            return 0;
        });
    }
    
    activeQuestionIndex = 0;
    
    // Setup checkbox toggle change event
    randomCheckbox.onchange = () => {
        startPracticeMode(lessonFilter);
    };
    
    loadPracticeQuestion();
}

function loadPracticeQuestion() {
    if (practiceList.length === 0) return;
    
    clearInterval(questionTimerInterval);
    currentQuestionTimeElapsed = 0;
    document.getElementById('practice-timer').innerText = '0.0s';
    
    activeQuestion = practiceList[activeQuestionIndex];
    
    // UI elements update
    document.getElementById('practice-number').innerText = `${activeQuestionIndex + 1} / ${practiceList.length}`;
    document.getElementById('practice-lesson-badge').innerText = activeQuestion.lesson || 'BÀI';
    document.getElementById('practice-question-text').innerText = activeQuestion.question;
    
    // Update progress bar
    const progressPercent = ((activeQuestionIndex) / practiceList.length) * 100;
    document.getElementById('practice-progress-bar').style.width = `${progressPercent}%`;
    
    // Update accuracy statistics
    const totalPracticeAttempts = state.stats.attempts;
    const accuracy = totalPracticeAttempts > 0 ? Math.round((state.stats.correct / totalPracticeAttempts) * 100) : 100;
    document.getElementById('practice-accuracy').innerText = `${accuracy}%`;
    
    // Bookmark status
    const isBookmarked = state.bookmarks.includes(activeQuestion.id);
    const bookmarkBtn = document.getElementById('practice-bookmark-btn');
    if (isBookmarked) {
        bookmarkBtn.classList.add('active');
        bookmarkBtn.innerHTML = '<i class="fa-solid fa-star text-warning"></i>';
    } else {
        bookmarkBtn.classList.remove('active');
        bookmarkBtn.innerHTML = '<i class="fa-regular fa-star"></i>';
    }
    
    bookmarkBtn.onclick = () => toggleBookmark(activeQuestion.id, bookmarkBtn);
    
    // Hide feedback/explanations
    document.getElementById('practice-feedback').classList.add('hidden');
    document.getElementById('practice-explanation-wrapper').classList.add('hidden');
    document.getElementById('practice-next-btn').classList.add('hidden');
    
    // Options Shuffling (A is correct index 0)
    // Create options with text and original index to keep track
    const optionsWithIndices = activeQuestion.options.map((text, idx) => ({ text, originalIndex: idx }));
    
    // Shuffle options array
    const shuffled = optionsWithIndices.sort(() => Math.random() - 0.5);
    shuffledOptions = shuffled.map(item => item.text);
    correctOptionIndexInShuffled = shuffled.findIndex(item => item.originalIndex === activeQuestion.correctAnswerIndex);
    
    // Render options
    const optionsContainer = document.getElementById('practice-options');
    optionsContainer.innerHTML = '';
    
    const letters = ['A', 'B', 'C', 'D'];
    shuffledOptions.forEach((optionText, idx) => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'option-choice';
        optionDiv.innerHTML = `
            <div class="choice-letter">${letters[idx]}</div>
            <div class="choice-content">${optionText}</div>
        `;
        
        optionDiv.addEventListener('click', () => handlePracticeAnswerSelection(idx, optionDiv));
        optionsContainer.appendChild(optionDiv);
    });
    
    // Start timing
    questionStartTime = Date.now();
    questionTimerInterval = setInterval(() => {
        currentQuestionTimeElapsed += 0.1;
        document.getElementById('practice-timer').innerText = `${currentQuestionTimeElapsed.toFixed(1)}s`;
    }, 100);
}

function toggleBookmark(qId, btnElement) {
    const idx = state.bookmarks.indexOf(qId);
    if (idx !== -1) {
        state.bookmarks.splice(idx, 1);
        btnElement.classList.remove('active');
        btnElement.innerHTML = '<i class="fa-regular fa-star"></i>';
        showToast('Đã xóa câu hỏi khỏi thư mục đã lưu.', 'info');
    } else {
        state.bookmarks.push(qId);
        btnElement.classList.add('active');
        btnElement.innerHTML = '<i class="fa-solid fa-star text-warning"></i>';
        showToast('Đã lưu câu hỏi vào danh sách học tập!', 'success');
    }
    saveStateToStorage();
}

function handlePracticeAnswerSelection(selectedIndex, clickedElement) {
    // If feedback is already shown and user answered correctly, lock
    if (!document.getElementById('practice-next-btn').classList.contains('hidden') && clickedElement.parentNode.querySelector('.correct')) {
        return; 
    }
    
    const optionsContainer = document.getElementById('practice-options');
    const allOptionElements = optionsContainer.querySelectorAll('.option-choice');
    
    // Stop timer
    clearInterval(questionTimerInterval);
    const timeSpentMs = Date.now() - questionStartTime;
    
    // Initialize question time tracking if missing
    if (!state.timeTracking[activeQuestion.id]) {
        state.timeTracking[activeQuestion.id] = { totalTime: 0, count: 0, wrongCount: 0 };
    }
    const track = state.timeTracking[activeQuestion.id];
    track.totalTime += timeSpentMs;
    track.count++;
    
    // Determine correctness
    const isCorrect = selectedIndex === correctOptionIndexInShuffled;
    
    state.stats.attempts++;
    
    if (isCorrect) {
        clickedElement.classList.add('correct');
        state.stats.correct++;
        incrementDailyProgress();
        
        // Leitner spacing logic: increase level if got correct on first attempt (we can tell it's first attempt if no WRONG class exists in current options)
        const hasWrongAttempted = !!optionsContainer.querySelector('.wrong');
        if (!hasWrongAttempted) {
            const currentLvl = state.leitnerLevels[activeQuestion.id] || 0;
            state.leitnerLevels[activeQuestion.id] = Math.min(5, currentLvl + 1);
            
            // Remove from mistakes list if answered correct on first go
            const mistakeIdx = state.incorrectQuestions.indexOf(activeQuestion.id);
            if (mistakeIdx !== -1) {
                state.incorrectQuestions.splice(mistakeIdx, 1);
            }
        }
        
        // Show correct message
        const feedback = document.getElementById('practice-feedback');
        feedback.innerText = 'Chính xác! Đang chuẩn bị chuyển câu tiếp theo...';
        feedback.className = 'feedback-msg correct';
        feedback.classList.remove('hidden');
        
        // Show explanation
        document.getElementById('practice-explanation-text').innerText = activeQuestion.explanation || `Đáp án đúng: ${activeQuestion.options[activeQuestion.correctAnswerIndex]}`;
        document.getElementById('practice-explanation-wrapper').classList.remove('hidden');
        
        // Disable choices
        allOptionElements.forEach(el => {
            el.style.pointerEvents = 'none';
        });
        
        // Auto-advance after 1 second
        document.getElementById('practice-next-btn').classList.remove('hidden');
        setTimeout(() => {
            // Check if we are still on the same view and index before advancing
            if (currentView === 'practice-view') {
                advancePracticeQuestion();
            }
        }, 1200);
        
    } else {
        clickedElement.classList.add('wrong');
        state.stats.wrong++;
        track.wrongCount++;
        
        // Reset Leitner level on wrong answer
        state.leitnerLevels[activeQuestion.id] = 0;
        
        // Add to mistakes list if not already there
        if (!state.incorrectQuestions.includes(activeQuestion.id)) {
            state.incorrectQuestions.push(activeQuestion.id);
        }
        
        // Show incorrect message
        const feedback = document.getElementById('practice-feedback');
        feedback.innerText = 'Chưa chính xác. Vui lòng suy nghĩ và thử lại!';
        feedback.className = 'feedback-msg wrong';
        feedback.classList.remove('hidden');
        
        // Resume timer for retry
        questionStartTime = Date.now();
        questionTimerInterval = setInterval(() => {
            currentQuestionTimeElapsed += 0.1;
            document.getElementById('practice-timer').innerText = `${currentQuestionTimeElapsed.toFixed(1)}s`;
        }, 100);
    }
    
    saveStateToStorage();
}

function advancePracticeQuestion() {
    activeQuestionIndex++;
    if (activeQuestionIndex >= practiceList.length) {
        showToast('Chúc mừng! Bạn đã hoàn thành danh sách câu hỏi ôn tập này.', 'success');
        
        // Add to history
        const todayStr = new Date().toLocaleDateString('vi-VN');
        const sessionAccuracy = Math.round((state.stats.correct / (state.stats.correct + state.stats.wrong)) * 100) || 100;
        state.history.push({
            date: todayStr,
            correct: state.stats.correct,
            wrong: state.stats.wrong,
            accuracy: sessionAccuracy
        });
        state.stats.sessionsCount++;
        saveStateToStorage();
        
        switchView('dashboard-view');
    } else {
        loadPracticeQuestion();
    }
}

// ---------------- MEMORIZATION MODE ----------------
function startMemorizeMode() {
    const isRandom = document.getElementById('memorize-random-checkbox').checked;
    
    let pool = [...state.questions];
    if (isRandom) {
        pool.sort(() => Math.random() - 0.5);
    } else {
        pool.sort((a, b) => a.id.localeCompare(b.id));
    }
    
    memorizeList = pool;
    memorizeActiveIndex = 0;
    
    document.getElementById('memorize-random-checkbox').onchange = startMemorizeMode;
    
    loadMemorizeQuestion();
}

function loadMemorizeQuestion() {
    if (memorizeList.length === 0) return;
    
    activeQuestion = memorizeList[memorizeActiveIndex];
    
    document.getElementById('memorize-number').innerText = `${memorizeActiveIndex + 1} / ${memorizeList.length}`;
    document.getElementById('memorize-lesson-badge').innerText = activeQuestion.lesson || 'BÀI';
    document.getElementById('memorize-question-text').innerText = activeQuestion.question;
    
    // Update progress bar
    const progressPercent = (memorizeActiveIndex / memorizeList.length) * 100;
    document.getElementById('memorize-progress-bar').style.width = `${progressPercent}%`;
    
    // Count mastered vs unmastered (mastered = level >= 3)
    const mastered = memorizeList.filter(q => (state.leitnerLevels[q.id] || 0) >= 3).length;
    const unmastered = memorizeList.length - mastered;
    document.getElementById('memorize-mastered').innerText = mastered;
    document.getElementById('memorize-unmastered').innerText = unmastered;
    
    // Bookmark status
    const isBookmarked = state.bookmarks.includes(activeQuestion.id);
    const bookmarkBtn = document.getElementById('memorize-bookmark-btn');
    if (isBookmarked) {
        bookmarkBtn.classList.add('active');
        bookmarkBtn.innerHTML = '<i class="fa-solid fa-star text-warning"></i>';
    } else {
        bookmarkBtn.classList.remove('active');
        bookmarkBtn.innerHTML = '<i class="fa-regular fa-star"></i>';
    }
    bookmarkBtn.onclick = () => toggleBookmark(activeQuestion.id, bookmarkBtn);
    
    // Reset views
    document.getElementById('memorize-reveal-area').classList.remove('hidden');
    document.getElementById('memorize-explanation-wrapper').classList.add('hidden');
    
    // Render disabled list of options
    const optionsContainer = document.getElementById('memorize-options');
    optionsContainer.innerHTML = '';
    
    const letters = ['A', 'B', 'C', 'D'];
    activeQuestion.options.forEach((optText, idx) => {
        const optDiv = document.createElement('div');
        optDiv.className = 'option-choice';
        optDiv.innerHTML = `
            <div class="choice-letter">${letters[idx]}</div>
            <div class="choice-content">${optText}</div>
        `;
        optionsContainer.appendChild(optDiv);
    });
    
    // Reveal Answer action
    document.getElementById('memorize-reveal-btn').onclick = () => {
        document.getElementById('memorize-reveal-area').classList.add('hidden');
        
        // Highlight correct choice (correctAnswerIndex is always 0 in raw)
        const correctIndexInOption = activeQuestion.correctAnswerIndex;
        const correctEl = optionsContainer.children[correctIndexInOption];
        if (correctEl) {
            correctEl.classList.add('correct');
        }
        
        // Show explanation
        document.getElementById('memorize-explanation-text').innerText = activeQuestion.explanation || `Đáp án đúng: ${activeQuestion.options[correctIndexInOption]}`;
        document.getElementById('memorize-explanation-wrapper').classList.remove('hidden');
    };
    
    // Learned vs Not Learned Actions
    document.getElementById('memorize-success-btn').onclick = () => {
        const currentLvl = state.leitnerLevels[activeQuestion.id] || 0;
        state.leitnerLevels[activeQuestion.id] = Math.min(5, currentLvl + 1);
        saveStateToStorage();
        advanceMemorizeQuestion();
    };
    
    document.getElementById('memorize-fail-btn').onclick = () => {
        state.leitnerLevels[activeQuestion.id] = 0; // reset
        
        // Add to wrong list automatically since they said they don't know it
        if (!state.incorrectQuestions.includes(activeQuestion.id)) {
            state.incorrectQuestions.push(activeQuestion.id);
        }
        saveStateToStorage();
        advanceMemorizeQuestion();
    };
}

function advanceMemorizeQuestion() {
    memorizeActiveIndex++;
    if (memorizeActiveIndex >= memorizeList.length) {
        showToast('Bạn đã đi qua toàn bộ danh sách ghi nhớ!', 'success');
        switchView('dashboard-view');
    } else {
        loadMemorizeQuestion();
    }
}

// ---------------- EXAM SIMULATION MODE ----------------
function renderExamConfig() {
    document.getElementById('exam-config').classList.remove('hidden');
    document.getElementById('exam-active-container').classList.add('hidden');
    document.getElementById('exam-results').classList.add('hidden');
    
    // Populate lesson filter select options
    const lessonFilter = document.getElementById('exam-lesson-filter');
    lessonFilter.innerHTML = '<option value="all">Toàn bộ 13 bài học</option>';
    
    const groups = getQuestionsByLesson();
    Object.keys(groups).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numA - numB;
    }).forEach(lesson => {
        lessonFilter.innerHTML += `<option value="${lesson}">${lesson} (${groups[lesson].length} câu)</option>`;
    });
    
    document.getElementById('exam-start-btn').onclick = startExamSimulation;
}

function startExamSimulation() {
    const qCountVal = document.getElementById('exam-question-count').value;
    const timeLimitVal = parseInt(document.getElementById('exam-time-limit').value) || 30;
    const lessonFilter = document.getElementById('exam-lesson-filter').value;
    
    let pool = [...state.questions];
    if (lessonFilter !== 'all') {
        pool = pool.filter(q => q.lesson === lessonFilter);
    }
    
    if (pool.length === 0) {
        showToast('Không có câu hỏi nào để thi.', 'warning');
        return;
    }
    
    // Select count
    let count = pool.length;
    if (qCountVal !== 'all') {
        count = Math.min(pool.length, parseInt(qCountVal));
    }
    
    // Shuffle pool to pick random questions
    pool.sort(() => Math.random() - 0.5);
    examQuestions = pool.slice(0, count);
    
    // Reset state
    examActiveIndex = 0;
    examSelectedAnswers = new Array(count).fill(null);
    examTotalSeconds = timeLimitVal * 60;
    examSecondsRemaining = examTotalSeconds;
    
    // UI toggle
    document.getElementById('exam-config').classList.add('hidden');
    document.getElementById('exam-active-container').classList.remove('hidden');
    
    // Start count down timer
    clearInterval(examTimer);
    updateExamTimerDisplay();
    examTimer = setInterval(() => {
        examSecondsRemaining--;
        updateExamTimerDisplay();
        if (examSecondsRemaining <= 0) {
            clearInterval(examTimer);
            finishExam();
            showToast('Hết thời gian thi thử! Đang tự động nộp bài...', 'warning');
        }
    }, 1000);
    
    loadExamQuestion();
    
    document.getElementById('exam-exit-btn').onclick = () => {
        if (confirm('Bạn có thực sự muốn nộp bài thi ngay lập tức?')) {
            clearInterval(examTimer);
            finishExam();
        }
    };
    
    document.getElementById('exam-next-btn').onclick = () => {
        const checkedOption = document.querySelector('#exam-options .selected');
        if (!checkedOption) {
            showToast('Vui lòng chọn câu trả lời trước khi tiếp tục.', 'warning');
            return;
        }
        
        // Save selected index
        const letters = ['A', 'B', 'C', 'D'];
        const selectedLetter = checkedOption.querySelector('.choice-letter').innerText;
        const selectedIdx = letters.indexOf(selectedLetter);
        examSelectedAnswers[examActiveIndex] = selectedIdx;
        
        examActiveIndex++;
        if (examActiveIndex >= examQuestions.length) {
            clearInterval(examTimer);
            finishExam();
        } else {
            loadExamQuestion();
        }
    };
}

function updateExamTimerDisplay() {
    const min = Math.floor(examSecondsRemaining / 60);
    const sec = examSecondsRemaining % 60;
    document.getElementById('exam-countdown').innerHTML = `<i class="fa-solid fa-hourglass-half"></i> ${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function loadExamQuestion() {
    const q = examQuestions[examActiveIndex];
    
    document.getElementById('exam-number').innerText = `${examActiveIndex + 1} / ${examQuestions.length}`;
    document.getElementById('exam-lesson-badge').innerText = q.lesson || 'BÀI';
    document.getElementById('exam-question-text').innerText = q.question;
    
    // Progress
    const percent = (examActiveIndex / examQuestions.length) * 100;
    document.getElementById('exam-progress-bar').style.width = `${percent}%`;
    
    // Render options
    const optionsContainer = document.getElementById('exam-options');
    optionsContainer.innerHTML = '';
    
    // Save mapping of shuffled choices so we can check answers later
    const optionsWithIndices = q.options.map((text, idx) => ({ text, originalIndex: idx }));
    
    // Shuffling choices
    const shuffled = optionsWithIndices.sort(() => Math.random() - 0.5);
    q.shuffledOptionsForExam = shuffled.map(x => x.text);
    q.correctIndexInShuffledExam = shuffled.findIndex(x => x.originalIndex === q.correctAnswerIndex);
    
    const letters = ['A', 'B', 'C', 'D'];
    q.shuffledOptionsForExam.forEach((optText, idx) => {
        const optDiv = document.createElement('div');
        optDiv.className = 'option-choice';
        optDiv.innerHTML = `
            <div class="choice-letter">${letters[idx]}</div>
            <div class="choice-content">${optText}</div>
        `;
        
        // Toggle selected state
        optDiv.addEventListener('click', () => {
            optionsContainer.querySelectorAll('.option-choice').forEach(el => {
                el.classList.remove('selected');
            });
            optDiv.classList.add('selected');
        });
        
        // Restore pre-selected state if going back (for future implementation of back button)
        if (examSelectedAnswers[examActiveIndex] === idx) {
            optDiv.classList.add('selected');
        }
        
        optionsContainer.appendChild(optDiv);
    });
    
    // Change button text for last question
    if (examActiveIndex === examQuestions.length - 1) {
        document.getElementById('exam-next-btn').innerHTML = 'Nộp bài <i class="fa-solid fa-flag-checkered"></i>';
    } else {
        document.getElementById('exam-next-btn').innerHTML = 'Câu tiếp theo <i class="fa-solid fa-arrow-right"></i>';
    }
}

function finishExam() {
    document.getElementById('exam-active-container').classList.add('hidden');
    document.getElementById('exam-results').classList.remove('hidden');
    
    let correctCount = 0;
    
    // Populate review list
    const reviewListContainer = document.getElementById('exam-review-questions-list');
    reviewListContainer.innerHTML = '';
    
    examQuestions.forEach((q, idx) => {
        const selectedIdx = examSelectedAnswers[idx];
        const correctIdx = q.correctIndexInShuffledExam;
        const isCorrect = selectedIdx === correctIdx;
        
        if (isCorrect) {
            correctCount++;
        }
        
        // Save stats for individual questions
        if (!state.timeTracking[q.id]) {
            state.timeTracking[q.id] = { totalTime: 0, count: 0, wrongCount: 0 };
        }
        const track = state.timeTracking[q.id];
        track.count++;
        if (!isCorrect) {
            track.wrongCount++;
            state.leitnerLevels[q.id] = 0; // reset Leitner
            if (!state.incorrectQuestions.includes(q.id)) {
                state.incorrectQuestions.push(q.id);
            }
        } else {
            const currentLvl = state.leitnerLevels[q.id] || 0;
            state.leitnerLevels[q.id] = Math.min(5, currentLvl + 1);
        }
        
        // Review Card HTML
        const card = document.createElement('div');
        card.className = 'review-question-item';
        
        const letters = ['A', 'B', 'C', 'D'];
        let optionsHTML = '';
        q.shuffledOptionsForExam.forEach((optText, optIdx) => {
            let className = '';
            if (optIdx === correctIdx) {
                className = 'correct-ans'; // Highlight correct answer
            } else if (optIdx === selectedIdx && !isCorrect) {
                className = 'selected-wrong'; // Highlight user incorrect answer
            }
            optionsHTML += `<div class="review-opt ${className}"><strong>${letters[optIdx]}.</strong> ${optText}</div>`;
        });
        
        card.innerHTML = `
            <div class="review-question-header">
                <span class="review-q-num">Câu hỏi ID: ${q.id} (${q.lesson})</span>
                <span class="review-q-status ${isCorrect ? 'correct' : 'wrong'}">
                    ${isCorrect ? '<i class="fa-solid fa-check"></i> Đúng' : '<i class="fa-solid fa-xmark"></i> Sai'}
                </span>
            </div>
            <p><strong>${q.question}</strong></p>
            <div class="review-options-summary">${optionsHTML}</div>
            <div class="explanation-box">
                <span class="exp-title"><i class="fa-solid fa-circle-info"></i> Giải thích:</span>
                <p class="exp-text">${q.explanation || `Đáp án đúng: ${q.options[q.correctAnswerIndex]}`}</p>
            </div>
        `;
        reviewListContainer.appendChild(card);
    });
    
    const accuracyPercent = Math.round((correctCount / examQuestions.length) * 100) || 0;
    
    // Update dashboard best score
    if (state.stats.bestExamScore === null || accuracyPercent > state.stats.bestExamScore) {
        state.stats.bestExamScore = accuracyPercent;
    }
    
    // Save to history
    const todayStr = new Date().toLocaleDateString('vi-VN');
    state.history.push({
        date: todayStr,
        correct: correctCount,
        wrong: examQuestions.length - correctCount,
        accuracy: accuracyPercent
    });
    
    state.stats.attempts += examQuestions.length;
    state.stats.correct += correctCount;
    state.stats.wrong += (examQuestions.length - correctCount);
    state.stats.sessionsCount++;
    
    saveStateToStorage();
    
    // Render scores
    document.getElementById('exam-result-correct').innerText = `${correctCount} / ${examQuestions.length}`;
    document.getElementById('exam-result-percent').innerText = `${accuracyPercent}%`;
    
    const isPassed = accuracyPercent >= 80;
    const statusText = isPassed ? 'ĐẠT (>= 80%)' : 'CHƯA ĐẠT (< 80%)';
    const statusColor = isPassed ? '#10b981' : '#ef4444';
    
    const statusEl = document.getElementById('exam-result-status');
    statusEl.innerText = statusText;
    statusEl.style.color = statusColor;
    
    const resultIcon = document.getElementById('exam-result-icon');
    if (isPassed) {
        resultIcon.className = 'fa-solid fa-medal gold-medal';
        document.getElementById('exam-result-title').innerText = 'Chúc mừng! Bạn đã Đạt bài kiểm tra!';
    } else {
        resultIcon.className = 'fa-solid fa-triangle-exclamation text-danger';
        document.getElementById('exam-result-title').innerText = 'Cố gắng lên! Bạn cần độ chính xác tốt hơn.';
    }
    
    // Time spent
    const secondsSpent = examTotalSeconds - examSecondsRemaining;
    const minSpent = Math.floor(secondsSpent / 60);
    const secSpent = secondsSpent % 60;
    document.getElementById('exam-result-time').innerText = `${minSpent} phút ${secSpent} giây`;
}

function setupExamEvents() {
    document.getElementById('exam-retry-btn').onclick = renderExamConfig;
}

// ---------------- MISTAKES REVIEW MODE ----------------
function startMistakesMode() {
    clearInterval(questionTimerInterval);
    
    mistakesList = [...state.incorrectQuestions].map(qId => {
        return state.questions.find(q => q.id === qId);
    }).filter(q => !!q);
    
    const emptyState = document.getElementById('mistakes-empty-state');
    const activeState = document.getElementById('mistakes-active-container');
    
    if (mistakesList.length === 0) {
        emptyState.classList.remove('hidden');
        activeState.classList.add('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    activeState.classList.remove('hidden');
    
    mistakesActiveIndex = 0;
    loadMistakesQuestion();
}

function loadMistakesQuestion() {
    if (mistakesList.length === 0) return;
    
    clearInterval(questionTimerInterval);
    currentQuestionTimeElapsed = 0;
    document.getElementById('mistakes-timer').innerText = '0.0s';
    
    activeQuestion = mistakesList[mistakesActiveIndex];
    
    document.getElementById('mistakes-number').innerText = `${mistakesActiveIndex + 1} / ${mistakesList.length}`;
    document.getElementById('mistakes-lesson-badge').innerText = activeQuestion.lesson || 'BÀI';
    document.getElementById('mistakes-question-text').innerText = activeQuestion.question;
    
    const progressPercent = (mistakesActiveIndex / mistakesList.length) * 100;
    document.getElementById('mistakes-progress-bar').style.width = `${progressPercent}%`;
    
    const isBookmarked = state.bookmarks.includes(activeQuestion.id);
    const bookmarkBtn = document.getElementById('mistakes-bookmark-btn');
    if (isBookmarked) {
        bookmarkBtn.classList.add('active');
        bookmarkBtn.innerHTML = '<i class="fa-solid fa-star text-warning"></i>';
    } else {
        bookmarkBtn.classList.remove('active');
        bookmarkBtn.innerHTML = '<i class="fa-regular fa-star"></i>';
    }
    bookmarkBtn.onclick = () => toggleBookmark(activeQuestion.id, bookmarkBtn);
    
    // Hide feedback/explanations
    document.getElementById('mistakes-feedback').classList.add('hidden');
    document.getElementById('mistakes-explanation-wrapper').classList.add('hidden');
    document.getElementById('mistakes-next-btn').classList.add('hidden');
    
    // Options Shuffling (A is correct index 0)
    const optionsWithIndices = activeQuestion.options.map((text, idx) => ({ text, originalIndex: idx }));
    const shuffled = optionsWithIndices.sort(() => Math.random() - 0.5);
    shuffledOptions = shuffled.map(item => item.text);
    correctOptionIndexInShuffled = shuffled.findIndex(item => item.originalIndex === activeQuestion.correctAnswerIndex);
    
    const optionsContainer = document.getElementById('mistakes-options');
    optionsContainer.innerHTML = '';
    
    const letters = ['A', 'B', 'C', 'D'];
    shuffledOptions.forEach((optionText, idx) => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'option-choice';
        optionDiv.innerHTML = `
            <div class="choice-letter">${letters[idx]}</div>
            <div class="choice-content">${optionText}</div>
        `;
        
        optionDiv.addEventListener('click', () => handleMistakesAnswerSelection(idx, optionDiv));
        optionsContainer.appendChild(optionDiv);
    });
    
    // Start timing
    questionStartTime = Date.now();
    questionTimerInterval = setInterval(() => {
        currentQuestionTimeElapsed += 0.1;
        document.getElementById('mistakes-timer').innerText = `${currentQuestionTimeElapsed.toFixed(1)}s`;
    }, 100);
}

function handleMistakesAnswerSelection(selectedIndex, clickedElement) {
    if (!document.getElementById('mistakes-next-btn').classList.contains('hidden') && clickedElement.parentNode.querySelector('.correct')) {
        return; 
    }
    
    clearInterval(questionTimerInterval);
    const timeSpentMs = Date.now() - questionStartTime;
    
    if (!state.timeTracking[activeQuestion.id]) {
        state.timeTracking[activeQuestion.id] = { totalTime: 0, count: 0, wrongCount: 0 };
    }
    const track = state.timeTracking[activeQuestion.id];
    track.totalTime += timeSpentMs;
    track.count++;
    
    const isCorrect = selectedIndex === correctOptionIndexInShuffled;
    const optionsContainer = document.getElementById('mistakes-options');
    
    state.stats.attempts++;
    
    if (isCorrect) {
        clickedElement.classList.add('correct');
        state.stats.correct++;
        incrementDailyProgress();
        
        // Spaced repetition level increases
        const hasWrongAttempted = !!optionsContainer.querySelector('.wrong');
        if (!hasWrongAttempted) {
            const currentLvl = state.leitnerLevels[activeQuestion.id] || 0;
            state.leitnerLevels[activeQuestion.id] = Math.min(5, currentLvl + 1);
            
            // Remove from mistakes list since they solved it on first try in review
            const mistakeIdx = state.incorrectQuestions.indexOf(activeQuestion.id);
            if (mistakeIdx !== -1) {
                state.incorrectQuestions.splice(mistakeIdx, 1);
            }
        }
        
        // Show correct message
        const feedback = document.getElementById('mistakes-feedback');
        feedback.innerText = 'Khắc phục thành công! Đang chuyển câu tiếp theo...';
        feedback.className = 'feedback-msg correct';
        feedback.classList.remove('hidden');
        
        // Show explanation
        document.getElementById('mistakes-explanation-text').innerText = activeQuestion.explanation || `Đáp án đúng: ${activeQuestion.options[activeQuestion.correctAnswerIndex]}`;
        document.getElementById('mistakes-explanation-wrapper').classList.remove('hidden');
        
        // Disable choices
        optionsContainer.querySelectorAll('.option-choice').forEach(el => {
            el.style.pointerEvents = 'none';
        });
        
        document.getElementById('mistakes-next-btn').classList.remove('hidden');
        setTimeout(() => {
            if (currentView === 'mistakes-view') {
                advanceMistakesQuestion();
            }
        }, 1200);
        
    } else {
        clickedElement.classList.add('wrong');
        state.stats.wrong++;
        track.wrongCount++;
        state.leitnerLevels[activeQuestion.id] = 0;
        
        const feedback = document.getElementById('mistakes-feedback');
        feedback.innerText = 'Vẫn chưa chính xác. Bạn cần thử lại!';
        feedback.className = 'feedback-msg wrong';
        feedback.classList.remove('hidden');
        
        // Resume timer
        questionStartTime = Date.now();
        questionTimerInterval = setInterval(() => {
            currentQuestionTimeElapsed += 0.1;
            document.getElementById('mistakes-timer').innerText = `${currentQuestionTimeElapsed.toFixed(1)}s`;
        }, 100);
    }
    
    saveStateToStorage();
}

function advanceMistakesQuestion() {
    mistakesActiveIndex++;
    if (mistakesActiveIndex >= mistakesList.length) {
        showToast('Bạn đã duyệt qua toàn bộ danh sách câu hỏi làm sai.', 'success');
        startMistakesMode(); // reload (will show empty state if all resolved)
    } else {
        loadMistakesQuestion();
    }
}

// ---------------- BOOKMARKS VIEW ----------------
function renderBookmarks() {
    const emptyState = document.getElementById('bookmarks-empty-state');
    const activeState = document.getElementById('bookmarks-active-container');
    
    const count = state.bookmarks.length;
    document.getElementById('bookmarks-total-count').innerText = count;
    
    if (count === 0) {
        emptyState.classList.remove('hidden');
        activeState.classList.add('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    activeState.classList.remove('hidden');
    
    const grid = document.getElementById('bookmarks-grid');
    grid.innerHTML = '';
    
    state.bookmarks.forEach(qId => {
        const q = state.questions.find(item => item.id === qId);
        if (q) {
            const card = document.createElement('div');
            card.className = 'bookmark-card glass';
            
            const truncatedQuestion = q.question.length > 90 ? q.question.substring(0, 90) + '...' : q.question;
            
            card.innerHTML = `
                <div class="bookmark-card-top">
                    <span class="badge">${q.lesson}</span>
                    <strong>ID: ${q.id}</strong>
                </div>
                <p class="bookmark-card-text" title="${q.question}">${truncatedQuestion}</p>
                <div class="bookmark-card-footer">
                    <span class="text-muted" style="font-size: 11px;">Mức độ: Lvl ${state.leitnerLevels[qId] || 0}</span>
                    <div class="bookmark-card-actions">
                        <button class="btn secondary btn-xs text-warning" onclick="removeBookmarkDirectly('${qId}')" title="Xóa lưu"><i class="fa-solid fa-star"></i></button>
                        <button class="btn primary btn-xs" onclick="practiceSingleQuestion('${qId}')" title="Học câu này"><i class="fa-solid fa-play"></i></button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        }
    });
}

function removeBookmarkDirectly(qId) {
    const idx = state.bookmarks.indexOf(qId);
    if (idx !== -1) {
        state.bookmarks.splice(idx, 1);
        saveStateToStorage();
        renderBookmarks();
        showToast('Đã xóa câu hỏi khỏi mục lưu trữ.', 'info');
    }
}

function setupBookmarksPractice() {
    document.getElementById('bookmarks-practice-btn').onclick = () => {
        if (state.bookmarks.length === 0) return;
        
        switchView('practice-view');
        
        // Assemble practiceList from bookmarks
        practiceList = state.bookmarks.map(qId => {
            return state.questions.find(q => q.id === qId);
        }).filter(q => !!q);
        
        activeQuestionIndex = 0;
        loadPracticeQuestion();
    };
}

// ---------------- SEARCH VIEW ----------------
let currentSearchQuery = '';
let currentSearchLesson = 'all';

function initSearchFilter() {
    const searchInput = document.getElementById('search-input');
    const lessonFilter = document.getElementById('search-lesson-filter');
    
    searchInput.oninput = (e) => {
        currentSearchQuery = e.target.value;
        renderSearchList();
    };
    
    lessonFilter.onchange = (e) => {
        currentSearchLesson = e.target.value;
        renderSearchList();
    };
}

function renderSearchList() {
    // Populate lesson filter dropdown if empty
    const selectFilter = document.getElementById('search-lesson-filter');
    if (selectFilter.children.length <= 1) {
        const groups = getQuestionsByLesson();
        Object.keys(groups).sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.replace(/\D/g, '')) || 0;
            return numA - numB;
        }).forEach(lesson => {
            selectFilter.innerHTML += `<option value="${lesson}">${lesson}</option>`;
        });
    }
    
    const tbody = document.getElementById('search-tbody');
    tbody.innerHTML = '';
    
    // Filter questions
    let filtered = [...state.questions];
    if (currentSearchLesson !== 'all') {
        filtered = filtered.filter(q => q.lesson === currentSearchLesson);
    }
    
    if (currentSearchQuery.trim() !== '') {
        const query = currentSearchQuery.toLowerCase();
        filtered = filtered.filter(q => {
            return q.id.includes(query) || 
                   q.question.toLowerCase().includes(query) || 
                   q.options.some(opt => opt.toLowerCase().includes(query));
        });
    }
    
    document.getElementById('search-results-count').innerText = filtered.length;
    
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Không tìm thấy câu hỏi nào phù hợp với tìm kiếm của bạn.</td></tr>';
        return;
    }
    
    // Render list
    filtered.forEach(q => {
        const isBookmarked = state.bookmarks.includes(q.id);
        const tr = document.createElement('tr');
        
        // Highlight correct option by adding class
        const correctText = q.options[q.correctAnswerIndex];
        const optionsList = q.options.map((optText, idx) => {
            const letter = ['a', 'b', 'c', 'd'][idx];
            const isCorrect = idx === q.correctAnswerIndex;
            return `<div style="margin-top: 4px; opacity: 0.9;" class="${isCorrect ? 'correct-underline' : ''}"><strong>${letter}.</strong> ${optText}</div>`;
        }).join('');
        
        tr.innerHTML = `
            <td><span class="badge">${q.lesson}</span></td>
            <td><strong>${q.id}</strong></td>
            <td>
                <div style="font-weight: 600; margin-bottom: 6px;">${q.question}</div>
                <div class="search-options-preview">${optionsList}</div>
            </td>
            <td class="text-center">
                <div style="display: flex; gap: 8px; justify-content: center;">
                    <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" onclick="toggleSearchBookmark('${q.id}', this)">
                        <i class="${isBookmarked ? 'fa-solid fa-star text-warning' : 'fa-regular fa-star'}"></i>
                    </button>
                    <button class="btn primary btn-xs" onclick="practiceSingleQuestion('${q.id}')"><i class="fa-solid fa-play"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function toggleSearchBookmark(qId, iconElement) {
    toggleBookmark(qId, iconElement);
    // Reload search to update state correctly
    renderSearchList();
}

// ---------------- SETTINGS & DATA STUFF ----------------
function renderSettingsPanel() {
    // Populate difficult questions table
    const tbody = document.getElementById('difficult-questions-tbody');
    tbody.innerHTML = '';
    
    // Profile difficult questions: questions with count > 0, sorted by (wrongCount/count) DESC, then wrongCount DESC, then averageTime DESC
    const profiles = [];
    state.questions.forEach(q => {
        const track = state.timeTracking[q.id];
        if (track && track.count > 0) {
            const wrong = track.wrongCount || 0;
            const avgTime = track.totalTime / track.count;
            const wrongRatio = wrong / track.count;
            
            // Only add if user ever got it wrong, or if it took average > 10s
            if (wrong > 0 || avgTime > 10000) {
                profiles.push({
                    q,
                    wrong,
                    avgTimeSec: (avgTime / 1000).toFixed(1),
                    ratio: wrongRatio
                });
            }
        }
    });
    
    if (profiles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Chưa có dữ liệu thống kê độ khó. Hãy làm thêm nhiều bài kiểm tra!</td></tr>';
        return;
    }
    
    // Sort profiles
    profiles.sort((a, b) => b.ratio - a.ratio || b.wrong - a.wrong || parseFloat(b.avgTimeSec) - parseFloat(a.avgTimeSec));
    
    // Render top 10 difficult questions
    profiles.slice(0, 10).forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="badge">${p.q.lesson}</span></td>
            <td><strong>${p.q.id}</strong></td>
            <td><span class="truncate-text" title="${p.q.question}">${p.q.question}</span></td>
            <td class="text-center"><span class="badge bg-danger">${p.wrong} lần</span></td>
            <td class="text-center"><strong>${p.avgTimeSec}s</strong></td>
            <td class="text-center"><button class="btn primary btn-xs" onclick="practiceSingleQuestion('${p.q.id}')"><i class="fa-solid fa-play"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
}

// ---------------- PDF PARSING ENGINE ----------------
function setupPDFImport() {
    const dropzone = document.getElementById('pdf-dropzone');
    const fileInput = document.getElementById('pdf-file-input');
    
    dropzone.addEventListener('click', () => fileInput.click());
    
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    
    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') {
            processPDFFile(files[0]);
        } else {
            showToast('Vui lòng chỉ tải lên tệp PDF.', 'warning');
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            processPDFFile(files[0]);
        }
    });
    
    document.getElementById('reset-default-questions-btn').onclick = () => {
        if (confirm('Bạn có chắc chắn muốn khôi phục ngân hàng câu hỏi mặc định? Lịch sử học tập sẽ được giữ lại.')) {
            fetchDefaultQuestions();
            showToast('Đã khôi phục ngân hàng câu hỏi mặc định!', 'success');
        }
    };
}

async function processPDFFile(file) {
    const progressWrapper = document.getElementById('pdf-import-progress-wrapper');
    const progressBar = document.getElementById('pdf-import-progress-bar');
    const statusText = document.getElementById('pdf-import-status');
    
    progressWrapper.classList.remove('hidden');
    progressBar.style.width = '5%';
    statusText.innerText = 'Đang đọc dữ liệu tệp PDF...';
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const typedarray = new Uint8Array(e.target.result);
            const pdfDoc = await pdfjsLib.getDocument(typedarray).promise;
            const numPages = pdfDoc.numPages;
            
            let fullText = '';
            
            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                statusText.innerText = `Đang chiết xuất văn bản trang: ${pageNum} / ${numPages}`;
                const percent = Math.round((pageNum / numPages) * 70) + 5;
                progressBar.style.width = `${percent}%`;
                
                const page = await pdfDoc.getPage(pageNum);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join('\n');
                fullText += pageText + '\n';
            }
            
            statusText.innerText = 'Đang phân tích cú pháp câu hỏi...';
            progressBar.style.width = '85%';
            
            // Invoke the parser function
            const parsedQuestions = parseRawQuestionsText(fullText);
            
            if (parsedQuestions.length === 0) {
                throw new Error('Không phân tích được bất kỳ câu hỏi hợp lệ nào từ tệp PDF này.');
            }
            
            progressBar.style.width = '100%';
            statusText.innerText = `Hoàn thành! Đã nhập ${parsedQuestions.length} câu hỏi thành công.`;
            
            // Save parsed questions
            state.questions = parsedQuestions;
            saveStateToStorage();
            
            showToast(`Đã nhập thành công ${parsedQuestions.length} câu hỏi từ tệp PDF!`, 'success');
            
            setTimeout(() => {
                progressWrapper.classList.add('hidden');
                switchView('dashboard-view');
            }, 1500);
            
        } catch (err) {
            console.error('Lỗi phân tích tệp PDF:', err);
            statusText.innerText = 'Lỗi nhập dữ liệu!';
            progressBar.style.width = '0%';
            showToast(err.message || 'Lỗi khi phân tích tệp PDF.', 'danger');
        }
    };
    
    reader.readAsArrayBuffer(file);
}

// Client-Side PDF Parser Logic
function parseRawQuestionsText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const questionsList = [];
    
    let currentLesson = "BÀI 1";
    let currentQuestion = null;
    
    const lessonRegex = /^BÀI\s+(\d+)/i;
    const questionRegex = /^(\d+\.\d+\.\d+)\.?\s+(.*)/;
    const optionARegex = /^a\.\s+(.*)/i;
    const optionBRegex = /^b\.\s+(.*)/i;
    const optionCRegex = /^c\.\s+(.*)/i;
    const optionDRegex = /^d\.\s+(.*)/i;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 1. Check for Lesson headers
        if (lessonRegex.test(line)) {
            const match = line.match(lessonRegex);
            currentLesson = `BÀI ${match[1]}`;
            continue;
        }
        
        // 2. Check for Question number start (e.g. 1.1.1. or 10.1.1.)
        if (questionRegex.test(line)) {
            if (currentQuestion) {
                questionsList.push(currentQuestion);
            }
            const match = line.match(questionRegex);
            currentQuestion = {
                id: match[1],
                lesson: currentLesson,
                question: match[2],
                options: [],
                correctAnswerIndex: 0,
                explanation: ""
            };
            continue;
        }
        
        // 3. Match options or continuation lines
        if (currentQuestion) {
            if (optionARegex.test(line)) {
                currentQuestion.options[0] = line.match(optionARegex)[1];
            } else if (optionBRegex.test(line)) {
                currentQuestion.options[1] = line.match(optionBRegex)[1];
            } else if (optionCRegex.test(line)) {
                currentQuestion.options[2] = line.match(optionCRegex)[1];
            } else if (optionDRegex.test(line)) {
                currentQuestion.options[3] = line.match(optionDRegex)[1];
            } else {
                // Continuation text
                const optsLength = currentQuestion.options.length;
                if (optsLength === 4) {
                    currentQuestion.options[3] += " " + line;
                } else if (optsLength === 3) {
                    currentQuestion.options[2] += " " + line;
                } else if (optsLength === 2) {
                    currentQuestion.options[1] += " " + line;
                } else if (optsLength === 1) {
                    currentQuestion.options[0] += " " + line;
                } else {
                    currentQuestion.question += " " + line;
                }
            }
        }
    }
    
    // Add final question
    if (currentQuestion) {
        questionsList.push(currentQuestion);
    }
    
    // Clean and validate questions
    const validQuestions = [];
    questionsList.forEach(q => {
        // Clean double spacing
        q.question = q.question.replace(/\s+/g, ' ').trim();
        let hasFourOptions = true;
        
        for (let idx = 0; idx < 4; idx++) {
            if (q.options[idx]) {
                q.options[idx] = q.options[idx].replace(/\s+/g, ' ').trim();
            } else {
                hasFourOptions = false;
            }
        }
        
        // We only accept valid questions with 4 options
        if (hasFourOptions && q.question.length > 5) {
            q.explanation = `Đáp án đúng là: ${q.options[0]}.`;
            validQuestions.push(q);
        }
    });
    
    return validQuestions;
}

// ---------------- BACKUP & RESTORE ----------------
function setupBackupRestore() {
    // Export JSON
    document.getElementById('export-progress-btn').onclick = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
        const downloadAnchor = document.createElement('a');
        const dateStr = new Date().toISOString().split('T')[0];
        
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `qp_quiz_backup_${dateStr}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast('Đã tải xuống tệp sao lưu tiến trình thành công!', 'success');
    };
    
    // Import JSON trigger
    const importInput = document.getElementById('import-progress-input');
    const importTrigger = document.getElementById('import-progress-trigger-btn');
    
    importTrigger.onclick = () => importInput.click();
    
    importInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const parsed = JSON.parse(evt.target.result);
                
                // Minimal validation check
                if (parsed.questions && Array.isArray(parsed.questions)) {
                    state = { ...state, ...parsed };
                    saveStateToStorage();
                    showToast('Đã khôi phục dữ liệu học tập thành công! Hệ thống đang tải lại...', 'success');
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    throw new Error('Cấu trúc dữ liệu tệp sao lưu không hợp lệ.');
                }
            } catch (err) {
                console.error(err);
                showToast('Không thể giải nén dữ liệu tiến trình. Tệp lỗi hoặc không đúng định dạng.', 'danger');
            }
        };
        reader.readAsText(file);
    };
    
    // CSV Export: Missed Questions
    document.getElementById('export-csv-btn').onclick = () => {
        if (state.incorrectQuestions.length === 0) {
            showToast('Bạn hiện tại không có câu hỏi làm sai nào để xuất báo cáo.', 'info');
            return;
        }
        
        // Build CSV string with BOM for Vietnamese characters
        let csvContent = "\uFEFF"; 
        csvContent += "Bai,ID,Cau hoi,Dap an A (Chuan),Dap an B,Dap an C,Dap an D\n";
        
        state.incorrectQuestions.forEach(qId => {
            const q = state.questions.find(item => item.id === qId);
            if (q) {
                // Escape double quotes in CSV fields
                const questionEsc = q.question.replace(/"/g, '""');
                const optA = q.options[0].replace(/"/g, '""');
                const optB = q.options[1].replace(/"/g, '""');
                const optC = q.options[2].replace(/"/g, '""');
                const optD = q.options[3].replace(/"/g, '""');
                
                csvContent += `"${q.lesson}","${q.id}","${questionEsc}","${optA}","${optB}","${optC}","${optD}"\n`;
            }
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.setAttribute("href", url);
        anchor.setAttribute("download", "cau_hoi_sai_tieng_viet.csv");
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        showToast('Xuất tệp CSV câu hỏi sai thành công!', 'success');
    };
    
    // PDF Export report using jsPDF
    document.getElementById('export-pdf-btn').onclick = () => {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            showToast('Chưa tải được thư viện xuất PDF.', 'danger');
            return;
        }
        
        const doc = new jsPDF();
        
        // Simple PDF Generation (Vietnamese characters might not render perfectly without standard Unicode font integration, so we use standardized ASCII layout or clean representations)
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(20);
        doc.text("BAO CAO KET QUA ON TAP QP-QUIZ", 15, 20);
        
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(11);
        doc.text(`Ngay xuat bao cao: ${new Date().toLocaleDateString('vi-VN')}`, 15, 28);
        
        doc.line(15, 32, 195, 32);
        
        doc.setFont("Helvetica", "bold");
        doc.text("1. Thong ke hoc tap chung:", 15, 42);
        doc.setFont("Helvetica", "normal");
        doc.text(`- Tong so cau hoi hien co: ${state.questions.length}`, 20, 50);
        
        const mastered = Object.keys(state.leitnerLevels).filter(id => state.leitnerLevels[id] >= 1).length;
        doc.text(`- So cau da ghi nho (Leitner Level >= 1): ${mastered}`, 20, 58);
        
        const percent = state.questions.length > 0 ? Math.round((mastered / state.questions.length) * 100) : 0;
        doc.text(`- Ti le hoan thanh khoa hoc: ${percent}%`, 20, 66);
        
        doc.text(`- So luot tra loi dung trong lich su: ${state.stats.correct}`, 20, 74);
        doc.text(`- So luot tra loi sai trong lich su: ${state.stats.wrong}`, 20, 82);
        doc.text(`- Diem kiem tra thi thu cao nhat: ${state.stats.bestExamScore !== null ? state.stats.bestExamScore + '%' : 'Chua thi'}`, 20, 90);
        doc.text(`- Tong so phien on tap da thuc hien: ${state.stats.sessionsCount}`, 20, 98);
        
        doc.setFont("Helvetica", "bold");
        doc.text("2. Cac bai lam sai hien tai:", 15, 112);
        doc.setFont("Helvetica", "normal");
        
        let y = 120;
        const limitCount = Math.min(state.incorrectQuestions.length, 12);
        doc.text(`Hien tai ban dang co ${state.incorrectQuestions.length} cau hoi lam sai.`, 20, y);
        y += 8;
        
        if (state.incorrectQuestions.length > 0) {
            doc.text(`Danh sach ID cac cau lam sai (Hien thi top 12):`, 20, y);
            y += 10;
            
            for (let i = 0; i < limitCount; i++) {
                const qId = state.incorrectQuestions[i];
                doc.text(`- ID: ${qId}`, 25, y);
                y += 8;
            }
            
            if (state.incorrectQuestions.length > 12) {
                doc.text("... va con nhieu cau lam sai khac, vui long xem tren website.", 20, y);
            }
        } else {
            doc.text("Tuyet voi! Ban dang co 0 cau hoi sai trong danh sach.", 20, y);
        }
        
        doc.save("qp_quiz_learning_report.pdf");
        showToast('Xuất báo cáo kết quả PDF thành công!', 'success');
    };
}

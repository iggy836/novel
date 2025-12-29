// ========================================
// グローバル変数
// ========================================
let currentQuestionId = null;
let timerInterval = null;
let remainingTime = 60;
let lastBeepSecond = -1; // 最後に音を鳴らした秒数
const TIMER_DURATION = 60;
const STORAGE_KEY = 'memo_progress';

// 音声用AudioContext（Chromeの自動再生ポリシー対応）
let audioContext = null;

// ========================================
// DOM要素
// ========================================
const topScreen = document.getElementById('top-screen');
const questionScreen = document.getElementById('question-screen');

// TOP画面要素
const questionNumberInput = document.getElementById('question-number');
const startButton = document.getElementById('start-button');
const randomButton = document.getElementById('random-button');
const errorMessage = document.getElementById('error-message');
const completedCountEl = document.getElementById('completed-count');
const progressPercentEl = document.getElementById('progress-percent');
const progressFillEl = document.getElementById('progress-fill');

// 問い表示画面要素
const logoButton = document.getElementById('logo-button');
const currentQuestionIdEl = document.getElementById('current-question-id');
const currentCategoryEl = document.getElementById('current-category');
const currentQuestionEl = document.getElementById('current-question');
const timerValueEl = document.getElementById('timer-value');
const timerProgressEl = document.getElementById('timer-progress');
const timerStatusEl = document.getElementById('timer-status');
const shareButton = document.getElementById('share-button');
const nextButton = document.getElementById('next-button');

// ========================================
// 初期化
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    loadProgress();
    updateProgressDisplay();
    setupEventListeners();

    // URLパラメータをチェック
    checkUrlParameters();
});

// ========================================
// イベントリスナー
// ========================================
function setupEventListeners() {
    // TOP画面
    startButton.addEventListener('click', handleStart);
    randomButton.addEventListener('click', handleRandomStart);
    questionNumberInput.addEventListener('input', clearError);
    questionNumberInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleStart();
    });

    // 問い表示画面
    logoButton.addEventListener('click', goToTop);
    shareButton.addEventListener('click', handleShare);
    nextButton.addEventListener('click', goToNextQuestion);
}

// ========================================
// 画面遷移
// ========================================
function showTopScreen() {
    topScreen.classList.add('active');
    questionScreen.classList.remove('active');
    questionNumberInput.value = '';
    clearError();
}

function showQuestionScreen(questionId) {
    const question = QUESTIONS.find(q => q.id === questionId);
    if (!question) {
        showError('問題が見つかりませんでした');
        return;
    }

    currentQuestionId = questionId;

    // 問い情報を表示
    currentQuestionIdEl.textContent = questionId;
    currentCategoryEl.textContent = question.category;
    currentQuestionEl.textContent = question.question;

    // 画面切替
    topScreen.classList.remove('active');
    questionScreen.classList.add('active');

    // プレビューモードでない場合はタイマー開始
    if (!questionScreen.dataset.preview) {
        // タイマー開始
        startTimer();

        // 進捗を保存
        saveProgress(questionId);
        updateProgressDisplay();
    }
}

// ========================================
// 問い選択
// ========================================
function handleStart() {
    const inputValue = questionNumberInput.value.trim();

    if (!inputValue) {
        showError('問題番号を入力してください');
        return;
    }

    const questionId = parseInt(inputValue, 10);

    if (isNaN(questionId) || questionId < 1 || questionId > 108) {
        showError('1～108の問題番号を入力してください');
        return;
    }

    showQuestionScreen(questionId);
}

function handleRandomStart() {
    const randomId = Math.floor(Math.random() * 108) + 1;
    showQuestionScreen(randomId);
}

function goToNextQuestion() {
    // プレビューモードの場合はスタート処理
    if (questionScreen.dataset.preview) {
        startFromPreview();
        return;
    }

    let nextId = currentQuestionId + 1;
    if (nextId > 108) nextId = 1;
    showQuestionScreen(nextId);
}

// ========================================
// タイマー機能
// ========================================
function startTimer() {
    // AudioContextを初期化（Chrome対応）
    initAudio();

    // タイマーをリセット
    stopTimer();
    remainingTime = TIMER_DURATION;
    lastBeepSecond = -1;
    updateTimerDisplay();
    timerStatusEl.textContent = '';
    timerStatusEl.classList.remove('completed');

    // タイマー開始（100ms間隔で滑らかに）
    timerInterval = setInterval(() => {
        remainingTime -= 0.1; // 100ms = 0.1秒

        if (remainingTime <= 0) {
            remainingTime = 0;
            updateTimerDisplay();
            onTimerComplete();
        } else {
            updateTimerDisplay();

            // 3秒前から音を鳴らす
            const currentSecond = Math.ceil(remainingTime);
            if (currentSecond <= 3 && currentSecond > 0 && currentSecond !== lastBeepSecond) {
                playBeep();
                lastBeepSecond = currentSecond;
            }
        }
    }, 100); // 100msごとに更新
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerDisplay() {
    // 整数部分を表示（小数点以下は切り捨て）
    const displaySeconds = Math.ceil(remainingTime);
    timerValueEl.textContent = displaySeconds;

    // 進捗リングの更新（滑らかに）
    const progress = remainingTime / TIMER_DURATION;
    const circumference = 2 * Math.PI * 54; // r=54
    const offset = circumference * (1 - progress);
    timerProgressEl.style.strokeDashoffset = offset;

    // 色の変更
    timerProgressEl.classList.remove('warning', 'danger');
    if (remainingTime <= 10) {
        timerProgressEl.classList.add('danger');
    } else if (remainingTime <= 30) {
        timerProgressEl.classList.add('warning');
    }
}

function onTimerComplete() {
    stopTimer();
    playCompleteSound(); // 終了音（特別な音）
    timerStatusEl.textContent = '✓ 時間終了！お疲れさまでした';
    timerStatusEl.classList.add('completed');
}

// ========================================
// 音声機能
// ========================================
function initAudio() {
    // AudioContextを作成（初回のみ）
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Chromeの自動再生ポリシー対応：suspended状態を解除
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function playBeep() {
    // AudioContextが初期化されていない場合は何もしない
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // 音の設定
    oscillator.type = 'sine'; // 正弦波
    oscillator.frequency.value = 800; // 800Hz

    // 音量（フェードイン/アウト）
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.2);

    // 再生
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
}

// 終了音（0秒専用）
function playCompleteSound() {
    // AudioContextが初期化されていない場合は何もしない
    if (!audioContext) return;

    // 和音を作成（C4, E4, G4 = 261.63Hz, 329.63Hz, 392Hz）
    const frequencies = [261.63, 329.63, 392];
    const duration = 0.6; // より長めの音

    frequencies.forEach((freq, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // 音の設定
        oscillator.type = 'sine';
        oscillator.frequency.value = freq;

        // 音量（少し遅延させて和音を重ねる）
        const startTime = audioContext.currentTime + (index * 0.05);
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

        // 再生
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
    });
}

// ========================================
// 進捗管理
// ========================================
function loadProgress() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('進捗データの読み込みに失敗しました', e);
    }

    return {
        completedQuestions: [],
        lastAccessDate: '',
        totalCompleted: 0
    };
}

function saveProgress(questionId) {
    const progress = loadProgress();

    // 重複チェック
    if (!progress.completedQuestions.includes(questionId)) {
        progress.completedQuestions.push(questionId);
        progress.totalCompleted = progress.completedQuestions.length;
    }

    // 最終アクセス日
    progress.lastAccessDate = new Date().toISOString().split('T')[0];

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) {
        console.error('進捗データの保存に失敗しました', e);
    }
}

function updateProgressDisplay() {
    const progress = loadProgress();
    const completed = progress.totalCompleted;
    const percent = Math.round((completed / 108) * 100);

    completedCountEl.textContent = completed;
    progressPercentEl.textContent = percent;
    progressFillEl.style.width = `${percent}%`;
}

// ========================================
// エラー表示
// ========================================
function showError(message) {
    errorMessage.textContent = message;
    questionNumberInput.focus();
}

function clearError() {
    errorMessage.textContent = '';
}

// ========================================
// ナビゲーション
// ========================================
function goToTop() {
    stopTimer();
    delete questionScreen.dataset.preview;
    nextButton.textContent = '次の問題へ';
    showTopScreen();
}

// ========================================
// URLパラメータ処理
// ========================================
function checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const questionId = urlParams.get('q');

    if (questionId) {
        const id = parseInt(questionId, 10);
        if (id >= 1 && id <= 108) {
            showQuestionPreview(id);
        }
    }
}

function showQuestionPreview(questionId) {
    const question = QUESTIONS.find(q => q.id === questionId);
    if (!question) return;

    currentQuestionId = questionId;

    // 問い情報を表示
    currentQuestionIdEl.textContent = questionId;
    currentCategoryEl.textContent = question.category;
    currentQuestionEl.textContent = question.question;

    // タイマーは表示するが開始しない
    timerValueEl.textContent = '60';
    timerProgressEl.style.strokeDashoffset = 0;
    timerProgressEl.classList.remove('warning', 'danger');
    timerStatusEl.textContent = '▶ スタートボタンを押して開始';

    // 画面切替
    topScreen.classList.remove('active');
    questionScreen.classList.add('active');

    // プレビューモードフラグ
    questionScreen.dataset.preview = 'true';

    // 次へボタンを「スタート」に変更
    nextButton.textContent = '▶ スタート';
}

function startFromPreview() {
    delete questionScreen.dataset.preview;
    nextButton.textContent = '次の問題へ';

    // タイマー開始
    startTimer();

    // 進捗を保存
    saveProgress(currentQuestionId);
    updateProgressDisplay();

    // URLパラメータをクリア
    window.history.replaceState({}, '', window.location.pathname);
}

// ========================================
// 共有機能
// ========================================
function handleShare() {
    const url = `${window.location.origin}${window.location.pathname}?q=${currentQuestionId}`;

    // クリップボードにコピー
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            showShareSuccess();
        }).catch(err => {
            fallbackCopyToClipboard(url);
        });
    } else {
        fallbackCopyToClipboard(url);
    }
}

function showShareSuccess() {
    const originalText = timerStatusEl.textContent;
    timerStatusEl.textContent = '✓ リンクをコピーしました！';
    timerStatusEl.classList.add('share-success');

    setTimeout(() => {
        if (questionScreen.dataset.preview === 'true') {
            timerStatusEl.textContent = '▶ スタートボタンを押して開始';
        } else {
            timerStatusEl.textContent = originalText;
        }
        timerStatusEl.classList.remove('share-success');
    }, 2000);
}

function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();

    try {
        document.execCommand('copy');
        showShareSuccess();
    } catch (err) {
        alert('リンクのコピーに失敗しました: ' + text);
    }

    document.body.removeChild(textArea);
}

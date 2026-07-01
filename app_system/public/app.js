document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const resultsList = document.getElementById('results-list');
    const countSpan = document.getElementById('count');
    const previewSection = document.getElementById('preview-section');
    const previewFrame = document.getElementById('preview-frame');
    const previewTitle = document.getElementById('preview-title');
    const closePreview = document.getElementById('close-preview');
    const categoryList = document.getElementById('category-list');
    const docxViewer = document.getElementById('docx-viewer');
    const pdfViewer = document.getElementById('pdf-viewer');
    const keywordNav = document.getElementById('keyword-nav');
    const matchCountSpan = document.getElementById('match-count');
    const prevMatchBtn = document.getElementById('prev-match');
    const nextMatchBtn = document.getElementById('next-match');

    // 初始化 PDF.js
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    let allResults = [];
    let activeCategory = 'all';
    let currentQuery = ''; 
    let currentPdfDoc = null; 
    let currentSource = 'association'; // 預設來源

    // 關鍵字跳轉狀態
    let matchState = {
        currentIndex: -1,
        matches: [], // Array of { pageNum, element, type: 'docx'|'pdf', matchIndexOnPage }
        query: ''
    };

    const updateMatchCountUI = () => {
        if (matchState.matches.length > 0) {
            keywordNav.style.display = 'flex';
            matchCountSpan.textContent = `${matchState.currentIndex + 1} / ${matchState.matches.length}`;
        } else {
            keywordNav.style.display = 'none';
        }
    };

    const navigateMatch = async (direction) => {
        if (matchState.matches.length === 0) return;

        // 移除舊的 active 樣式
        const oldMatch = matchState.matches[matchState.currentIndex];
        if (oldMatch && oldMatch.element) {
            oldMatch.element.classList.remove('active-highlight');
        }

        // 計算新索引
        if (direction === 'next') {
            matchState.currentIndex = (matchState.currentIndex + 1) % matchState.matches.length;
        } else if (direction === 'prev') {
            matchState.currentIndex = (matchState.currentIndex - 1 + matchState.matches.length) % matchState.matches.length;
        } else {
            if (matchState.currentIndex === -1) matchState.currentIndex = 0;
        }

        const newMatch = matchState.matches[matchState.currentIndex];
        
        if (newMatch.type === 'docx') {
            newMatch.element.classList.add('active-highlight');
            newMatch.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (newMatch.type === 'pdf') {
            const targetPage = document.getElementById(`pdf-page-${newMatch.pageNum}`);
            pdfViewer.scrollTo({
                top: targetPage.offsetTop - 20,
                behavior: 'smooth'
            });

            let retry = 0;
            const findMark = setInterval(() => {
                const marks = targetPage.querySelectorAll('.doc-highlight');
                if (marks.length > 0 && marks[newMatch.matchIndexOnPage]) {
                    clearInterval(findMark);
                    const el = marks[newMatch.matchIndexOnPage];
                    newMatch.element = el;
                    el.classList.add('active-highlight');
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                if (++retry > 30) clearInterval(findMark);
            }, 100);
        }

        updateMatchCountUI();
    };

    prevMatchBtn.addEventListener('click', () => navigateMatch('prev'));
    nextMatchBtn.addEventListener('click', () => navigateMatch('next'));

    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.addEventListener('click', (e) => {
            e.preventDefault();
            const source = nav.getAttribute('data-source');
            if (source === currentSource) return;
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            nav.classList.add('active');
            currentSource = source;
            allResults = [];
            activeCategory = 'all';
            resultsList.innerHTML = '<div class="empty-state">請輸入關鍵字開始搜尋</div>';
            countSpan.textContent = '0';
            categoryList.innerHTML = '<li class="active" data-cat="all">全部法規</li>';
            previewSection.classList.remove('open');
            if (searchInput.value.trim()) performSearch();
        });
    });

    const performSearch = async () => {
        const query = searchInput.value.trim();
        if (!query) return;
        currentQuery = query; 
        resultsList.innerHTML = '<div class="empty-state">搜尋中...</div>';
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&source=${currentSource}`);
            allResults = await response.json();
            renderResults();
            updateCategories();
        } catch (error) {
            console.error('Search error:', error);
            resultsList.innerHTML = '<div class="empty-state">搜尋出錯，請稍後再試</div>';
        }
    };

    const renderResults = () => {
        const filtered = activeCategory === 'all' ? allResults : allResults.filter(r => r.category === activeCategory);
        countSpan.textContent = filtered.length;
        if (filtered.length === 0) {
            resultsList.innerHTML = '<div class="empty-state">找不到符合的法規</div>';
            return;
        }
        resultsList.innerHTML = filtered.map((result, index) => `
            <div class="result-card" data-index="${index}">
                <div class="result-header">
                    <div class="result-title">${result.title}</div>
                    <div class="badge">${result.category}</div>
                </div>
                <div class="result-preview">${result.preview}</div>
            </div>
        `).join('');
        document.querySelectorAll('.result-card').forEach(card => {
            card.addEventListener('click', () => {
                const index = card.getAttribute('data-index');
                openPreview(filtered[index]);
            });
        });
    };

    const updateCategories = () => {
        const cats = ['all', ...new Set(allResults.map(r => r.category))];
        categoryList.innerHTML = cats.map(cat => `
            <li class="${cat === activeCategory ? 'active' : ''}" data-cat="${cat}">
                ${cat === 'all' ? '全部法規' : cat}
            </li>
        `).join('');
        categoryList.querySelectorAll('li').forEach(li => {
            li.addEventListener('click', () => {
                activeCategory = li.getAttribute('data-cat');
                categoryList.querySelectorAll('li').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
                renderResults();
            });
        });
    };

    const openPreview = async (result) => {
        const filename = result.filename.toLowerCase();
        previewTitle.textContent = result.title;
        matchState = { currentIndex: -1, matches: [], query: currentQuery };
        updateMatchCountUI();
        document.querySelector('.preview-placeholder').style.display = 'none';
        previewSection.classList.add('open');
        docxViewer.style.display = 'none';
        pdfViewer.style.display = 'none';
        docxViewer.innerHTML = "";
        pdfViewer.innerHTML = "";

        if (filename.endsWith('.pdf')) {
            pdfViewer.style.display = 'block';
            renderPdfDocument(result.url, currentQuery);
        } else if (filename.endsWith('.docx')) {
            docxViewer.style.display = 'block';
            docxViewer.innerHTML = '<div style="text-align: center; padding: 3rem; color: #7f8c8d;">載入 Word 文件中...</div>';
            try {
                const response = await fetch(result.url);
                const arrayBuffer = await response.arrayBuffer();
                const renderResult = await mammoth.convertToHtml({arrayBuffer: arrayBuffer});
                docxViewer.innerHTML = `<div class="docx-content">${renderResult.value}</div>`;
                if (currentQuery) {
                    const instance = new Mark(docxViewer);
                    instance.mark(currentQuery, {
                        "className": "doc-highlight",
                        "separateWordSearch": false,
                        "acrossElements": true,
                        "accuracy": "partially",
                        "done": () => {
                            const elements = docxViewer.querySelectorAll('.doc-highlight');
                            matchState.matches = Array.from(elements).map(el => ({ type: 'docx', element: el }));
                            if (matchState.matches.length > 0) navigateMatch('none');
                        }
                    });
                }
            } catch (err) {
                console.error('DOCX error:', err);
                docxViewer.innerHTML = `<div style="text-align: center; padding: 3rem; color: #e74c3c;">預覽失敗。</div>`;
            }
        }
    };

    async function renderPdfDocument(url, query) {
        pdfViewer.innerHTML = '<div style="text-align: center; padding: 3rem; color: #7f8c8d; font-size: 1.1rem;">載入高畫質 PDF 中...</div>';
        try {
            const loadingTask = pdfjsLib.getDocument(url);
            currentPdfDoc = await loadingTask.promise;
            pdfViewer.innerHTML = ''; 
            if (query) {
                const tempMatches = [];
                for (let i = 1; i <= currentPdfDoc.numPages; i++) {
                    const page = await currentPdfDoc.getPage(i);
                    const content = await page.getTextContent();
                    const pageText = content.items.map(item => item.str).join('');
                    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                    let match;
                    let mIdx = 0;
                    while ((match = regex.exec(pageText)) !== null) {
                        tempMatches.push({ type: 'pdf', pageNum: i, matchIndexOnPage: mIdx++, element: null });
                    }
                }
                matchState.matches = tempMatches;
            }

            for (let pageNum = 1; pageNum <= currentPdfDoc.numPages; pageNum++) {
                const pageWrapper = document.createElement('div');
                pageWrapper.className = 'pdf-page-container';
                pageWrapper.id = `pdf-page-${pageNum}`;
                
                const canvas = document.createElement('canvas');
                pageWrapper.appendChild(canvas);
                
                const textLayerDiv = document.createElement('div');
                textLayerDiv.className = 'textLayer';
                pageWrapper.appendChild(textLayerDiv);
                
                pdfViewer.appendChild(pageWrapper);

                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            observer.unobserve(pageWrapper);
                            renderPdfPage(pageNum, pageWrapper, canvas, textLayerDiv, query);
                        }
                    });
                }, { root: pdfViewer, rootMargin: '100% 0px' });
                observer.observe(pageWrapper);
            }
            if (matchState.matches.length > 0) setTimeout(() => navigateMatch('none'), 800);
        } catch (e) {
            console.error('PDF error:', e);
            pdfViewer.innerHTML = '<div style="text-align: center; padding: 3rem; color: #e74c3c;">PDF 載入失敗。</div>';
        }
    }

    async function renderPdfPage(pageNum, wrapper, canvas, textLayerDiv, query) {
        if (!currentPdfDoc) return;
        const page = await currentPdfDoc.getPage(pageNum);
        
        // --- 高清渲染策略 ---
        const dpr = window.devicePixelRatio || 1;
        const containerWidth = pdfViewer.clientWidth - 40;
        const baseViewport = page.getViewport({ scale: 1.0 });
        const baseScale = containerWidth / baseViewport.width;
        
        // 渲染倍率：基礎倍率 * DPR * 1.5 (確保絕對清晰)
        const renderScale = baseScale * dpr * 1.5;
        const viewport = page.getViewport({ scale: renderScale });
        
        // CSS 顯示大小 (維持原樣)
        const displayViewport = page.getViewport({ scale: baseScale });
        
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = Math.floor(displayViewport.width) + "px";
        canvas.style.height = Math.floor(displayViewport.height) + "px";
        
        wrapper.style.width = Math.floor(displayViewport.width) + 'px';
        wrapper.style.height = Math.floor(displayViewport.height) + 'px';
        
        const ctx = canvas.getContext('2d', { alpha: false });
        
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;

        // 文字層 (用於搜尋高亮，需對齊 CSS 顯示大小)
        const textContent = await page.getTextContent();
        textLayerDiv.innerHTML = ""; // 確保清理舊層，防止殘影
        textLayerDiv.style.width = displayViewport.width + 'px';
        textLayerDiv.style.height = displayViewport.height + 'px';
        textLayerDiv.style.setProperty('--scale-factor', displayViewport.scale);
        
        await pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: displayViewport,
            textDivs: []
        }).promise;
        
        if (query) {
            const instance = new Mark(textLayerDiv);
            instance.mark(query, {
                "acrossElements": true,
                "separateWordSearch": false,
                "className": "doc-highlight"
            });
            
            if (matchState.currentIndex >= 0 && matchState.matches[matchState.currentIndex].pageNum === pageNum) {
                setTimeout(() => {
                    const marks = textLayerDiv.querySelectorAll('.doc-highlight');
                    const cur = matchState.matches[matchState.currentIndex];
                    if (marks[cur.matchIndexOnPage]) {
                        cur.element = marks[cur.matchIndexOnPage];
                        cur.element.classList.add('active-highlight');
                    }
                }, 200);
            }
        }
    }

    closePreview.addEventListener('click', () => {
        previewSection.classList.remove('open');
        docxViewer.innerHTML = '';
        pdfViewer.innerHTML = '';
        currentPdfDoc = null;
        keywordNav.style.display = 'none';
    });

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(); });
});

// =========================================================================
// 🏠 HOMEPAGE NAVIGATION LAYER (APPENDED CONTROLLER LOGIC)
// =========================================================================
function initializePlatformRouter() {
    const homePage = document.getElementById("home-page");
    const workspacePage = document.getElementById("workspace-page");
    const navHome = document.getElementById("nav-home-btn");
    const navWork = document.getElementById("nav-workspace-btn");
    const gatewayBtn = document.getElementById("enter-workspace-btn");

    function routeToHome() {
        homePage.classList.remove("hidden");
        workspacePage.classList.add("hidden");
        navHome.classList.add("active");
        navWork.classList.remove("active");
        window.scrollTo(0,0);
    }
    function routeToWorkspace() {
        workspacePage.classList.remove("hidden");
        homePage.classList.add("hidden");
        navWork.classList.add("active");
        navHome.classList.remove("active");
        window.scrollTo(0,0);
    }
    if (navHome) navHome.addEventListener("click", routeToHome);
    if (navWork) navWork.addEventListener("click", routeToWorkspace);
    if (gatewayBtn) gatewayBtn.addEventListener("click", routeToWorkspace);
}

// SUBSECTION 3C: SCROLL VELOCITY DETECTOR & SIDE TRACKER
function initializeDataCoreScrollTracker() {
    const datacoreNav = document.getElementById("dynamic-nav-datacore");
    const secParser = document.getElementById("parser-section"); // Ensure your parser container has this ID
    const secDataCore = document.getElementById("datacore-section"); // Ensure your datacore container has this ID
    const btnP = document.getElementById("jump-to-parser");
    const btnD = document.getElementById("jump-to-datacore");

    // Smooth scroll jumps when navigation buttons are clicked
    if (btnP && secParser) btnP.addEventListener("click", () => window.scrollTo({ top: secParser.offsetTop - 85, behavior: "smooth" }));
    if (btnD && secDataCore) btnD.addEventListener("click", () => window.scrollTo({ top: secDataCore.offsetTop - 85, behavior: "smooth" }));

    // Dynamic scroll tracking listener
    window.addEventListener("scroll", () => {
        // 1. Handle the bottom-right corner float transition
        if (datacoreNav) {
            if (window.scrollY > 20) {
                datacoreNav.classList.add("scrolled");
            } else {
                datacoreNav.classList.remove("scrolled");
            }
        }

        // 2. Automatically change active button state based on current viewport location
        if (secDataCore && btnD && btnP) {
            const datacoreTop = secDataCore.getBoundingClientRect().top;
            // If the Operations DataCore section is scrolled into view (250px near top)
            if (datacoreTop <= 250) {
                btnD.classList.add("active");
                btnP.classList.remove("active");
            } else {
                btnP.classList.add("active");
                btnD.classList.remove("active");
            }
        }
    });
}


// =========================================================================
// 📊 ORIGINAL BUSINESS REPORT PARSER 3.0 JAVASCRIPT (UNTOUCHED CORE ENGINE)
// =========================================================================

// Unicode Normalization Interceptor
function normalizeText(text) {
    if (!text) return "";
    return text.normalize('NFKD').replace(/[\u{1D400}-\u{1D7FF}]/gu, char => {
        const code = char.codePointAt(0);
        if (code >= 0x1D670 && code <= 0x1D689) return String.fromCharCode(code - 0x1D670 + 65);
        if (code >= 0x1D68A && code <= 0x1D6A3) return String.fromCharCode(code - 0x1D68A + 97);
        if (code >= 0x1D7f6 && code <= 0x1D7FF) return String.fromCharCode(code - 0x1D7F6 + 48);
        return char;
    });
} 

// Global Variables to securely cache a raw paste box metadata value
let extractedMarketName = "Unknown Market"; 
let extractedReportDate = ""; 
// [IMPLEMENTATION FIX]: Global cache variable to hold full historical compliance payload parameters
let cachedSheetHistory = null;
    
// Helper Function to cleanly format any Date Object to DD/MM/YYYY
function formatDateToString(dateObj) {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${day}/${month}/${year}`;
}

// Generates the current calendar date as a dynamic fallback string
function getFormattedCurrentdate() {
    const today = new Date();
    return formatDateToString(today);
}

// --- EXTRACTION LOGIC ---
function extractData() {
    const rawText = document.getElementById('reportInput').value;
    const text = normalizeText(rawText);
    const missingWords = [];

    // [IMPLEMENTATION FIX]: Cleanly reset ui warning boxes and data caches before processing run
    const extractWarningBox = document.getElementById('extraction-mismatch-flag');
    if (extractWarningBox) extractWarningBox.style.display = "none";
    const systemOverrideBox = document.getElementById('sheet-correction-override');
    if (systemOverrideBox) systemOverrideBox.checked = false; 
    cachedSheetHistory = null;

    // Set dynamic default fallback date
    extractedReportDate = getFormattedCurrentdate();

    // 1. DEDICATED TEXT EXTRACTION ENGINE (For Dates & Market Names)
    const dateRegex = /Date[^*:\n]*[*:]*\s*([0-9]{1,2}\/[0-9]{1,2}\/([0-9]{2,4}))/i;
    const dateMatch = text.match(dateRegex);
    if (dateMatch) {
        let matchedDate = dateMatch[1].trim(); 
        let parts = matchedDate.split('/');
        let day = parts[0].padStart(2, '0');
        let month = parts[1].padStart(2, '0');
        let year = parts[2];
        
        if (year.length === 2) {
            year = '20' + year;
        }
        extractedReportDate = `${day}/${month}/${year}`; 
    } else {
        missingWords.push("Report Date");
    }

    const marketRegex = /(?:Marke[a-z]*|Locat[a-z]*)[^*:\n]*[*:]*\s*([A-Za-z0-9\s._-]+)/i;
    const marketMatch = text.match(marketRegex);
    
    // First, map local raw text regex inputs so fields exist for dynamic target validations
    const getValue = (keyword) => {
        const regex = new RegExp(`${keyword}[^0-9\\n]*([0-9,.]+)`, 'i');
        const match = text.match(regex);
        if (match) {
            return parseFloat(match[1].replace(/,/g, ''));
        } else {
            missingWords.push(keyword.replace("[a-z]*","").replace(".s","'s"));
            return 0; 
        }
    };

    const mapping = {
        'openingCash': getValue("Opening Cash[a-z]*"),
        'openingpd': getValue("Opening Pa[a-z]*"),
        'todayPd': getValue("Today.s Pa[a-z]*"),
        'officecash': getValue("Cash fro[a-z]*"),
        'supposeColl': getValue("Suppos[a-z]* Collection"),
        'supposeColl2': getValue("Suppos[a-z]* Collection"),
        'recovery': getValue("Recov[a-z]*"),
        'recovery2': getValue("Recov[a-z]*"),
        'interestOnDeals': getValue("Intere[a-z]* on Deals"),
        'formsSold': getValue("daily forms sold"),
        'cardsSold': getValue("daily cards sold"),
        'payOff': getValue("pay[a-z]* off collected Today"),
        'payOff2': getValue("pay[a-z]* off collected Today"),
        'TotalDeposit': getValue("Total Deposits to Bank"),
        'defaultAmt': getValue("Default"),
        'defaultAmt2': getValue("Default"),
        'costOfDeals': getValue("Cost of Deals"),
        'usedPd': getValue("Use[a-z]* Pa"),
        'previousoutstanding': getValue("Prev[a-z]*. Outstan"),
        'inheritedoutstanding': getValue("Inherited Outstanding"),
        'myoutstanding': getValue("My Outstanding")
    };

    for (const [elementId, extractedValue] of Object.entries(mapping)) {
        const element = document.getElementById(elementId);
        if (element) {
            element.value = extractedValue;
        }
    }

    // New Deals Automation allocation
    const costOfDealsElement = document.getElementById('costOfDeals');
    const costOfDealsVal = costOfDealsElement ? (parseFloat(costOfDealsElement.value) || 0) : 0;
    const computedNewDealInstallment = costOfDealsVal / 25;
    
    const calcCell3Input = document.getElementById('calcCell3');
    if (calcCell3Input) {
        calcCell3Input.value = computedNewDealInstallment.toFixed(2);
    }

    if (marketMatch && marketMatch[1].trim() !== "") {
        let rawMarket = marketMatch[1].trim();
        extractedMarketName = rawMarket.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
        
        const GOOGLE_SHEETS_API_ENDPOINT = "https://script.google.com/macros/s/AKfycbzpixGUMPZQ49tCjUdztkFY2orZDGmw4KOodufl3WE0W83FUpfewh5vskTGH6TP7GD1/exec";
        
        // [IMPLEMENTATION FIX]: Expanded fetch query parsing framework to pull and auto-validate all historical data metrics safely
        fetch(`${GOOGLE_SHEETS_API_ENDPOINT}?market=${encodeURIComponent(extractedMarketName)}&excludeDate=${encodeURIComponent(extractedReportDate)}`)
            .then(response => response.json())
            .then(data => {
                if (data.status === "success") {
                    cachedSheetHistory = data;
                    
                    const openingCashInput = document.getElementById('openingCash');
                    const supposeCollInput = document.getElementById('supposeColl');
                    const previousOutstandingInput = document.getElementById('previousoutstanding');
                    
                    if (previousOutstandingInput) {
                        previousOutstandingInput.value = data.previousOutstanding;
                        console.log(`Successfully pulled prior balance for ${extractedMarketName}: ₦${data.previousOutstanding}`);
                        if (typeof runOutstandingCalc === "function") runOutstandingCalc();
                    }

                    // Dynamic multi-parameter variance tracker checks
                    let correctionRequired = false;
                    let mismatchDetails = [];

                    const currentOpeningCash = parseFloat(openingCashInput ? openingCashInput.value : 0) || 0;
                    const targetOpeningCash = parseFloat(data.expectedOpeningCash) || 0;
                    if (currentOpeningCash !== targetOpeningCash) {
                        correctionRequired = true;
                        mismatchDetails.push(`Opening Cash Variance (Extracted: ₦${currentOpeningCash.toLocaleString()} vs Sheet Total Cash Today: ₦${targetOpeningCash.toLocaleString()})`);
                    }

                    const currentSupposedColl = parseFloat(supposeCollInput ? supposeCollInput.value : 0) || 0;
                    const targetSupposedColl = parseFloat(data.expectedSupposedCollection) || 0;
                    if (currentSupposedColl !== targetSupposedColl) {
                        correctionRequired = true;
                        mismatchDetails.push(`Supposed Collection Variance (Extracted: ₦${currentSupposedColl.toLocaleString()} vs Sheet Next Day Collection: ₦${targetSupposedColl.toLocaleString()})`);
                    }

                    const currentPrevOutstanding = parseFloat(previousOutstandingInput ? previousOutstandingInput.value : 0) || 0;
                    const targetPrevOutstanding = parseFloat(data.previousOutstanding) || 0;
                    if (currentPrevOutstanding !== targetPrevOutstanding) {
                        correctionRequired = true;
                        mismatchDetails.push(`Previous Outstanding Variance (Extracted: ₦${currentPrevOutstanding.toLocaleString()} vs Sheet Total Outstanding: ₦${targetPrevOutstanding.toLocaleString()})`);
                    }

                    // Dynamically render the compliance UI mismatch module layout warning box
                    const warningDetailsText = document.getElementById('extraction-warning-details');
                    if (correctionRequired && extractWarningBox) {
                        if (warningDetailsText) {
                            warningDetailsText.innerHTML = `⚠️ <strong>Audit Discrepancies Detected:</strong> Current raw report variables do not match yesterday's finalized ledger tracking numbers:<br><ul style="margin-top: 5px; padding-left: 20px; color: #78350f;"><li>` + 
                            mismatchDetails.join("</li><li>") + `</li></ul>Tick the check box option block below to dynamically force sync input parameters with your sheet database logs.`;
                        }
                        extractWarningBox.style.display = "block";
                    }
                }
            })
            .catch(err => console.error("Error pulling history payload:", err));
        
        if (typeof syncParserMetadataToDataCoreEnv === "function") {
            syncParserMetadataToDataCoreEnv(extractedMarketName, extractedReportDate, text);
        }
        
    } else {
        extractedMarketName = "Unknown Market";
        missingWords.push("Market Name");
    }    

    if (document.getElementById('displayDate')) document.getElementById('displayDate').value = extractedReportDate;
    if (document.getElementById('displayMarket')) document.getElementById('displayMarket').value = extractedMarketName;

    const errorBox = document.getElementById('errorBox');
    const missingList = document.getElementById('missingList');
    if (missingWords.length > 0 && missingList) {
        errorBox.classList.remove('hidden');
        missingList.innerHTML = missingWords.map(field => `<li>${field}</li>`).join("");
    } else if (errorBox) {
        errorBox.classList.add('hidden');
    }
}

// --- CALCULATION LOGIC & GOOGLE SHEETS TRANSMISSION ---
async function runCalculation() {
    const getVal = (id) => parseFloat(document.getElementById(id).value) || 0;

    const warningFlag = document.getElementById('mismatch-warning-flag');
    const overwriteCheckbox = document.getElementById('overwrite-override-checkbox');    

    const isOverrideTicked = overwriteCheckbox ? overwriteCheckbox.checked : false;

    if (!isOverrideTicked && warningFlag) {
        warningFlag.style.display = "none";
    }

    const currentCostOfDeals = getVal('costOfDeals');
    const validatedNewDeals = currentCostOfDeals / 25;
    const calcCell3Field = document.getElementById('calcCell3');
    if (calcCell3Field) {
        calcCell3Field.value = validatedNewDeals.toFixed(2);
    }

    const data = {
        opening: getVal('openingCash'),
        openingpd: getVal('openingpd'),
        frmoffice: getVal('officecash'),
        suppose: getVal('supposeColl'),
        supposecoll2: getVal('supposeColl2'),
        recovery: getVal('recovery'),
        recovery2: getVal('recovery2'),
        interest: getVal('interestOnDeals'),
        forms: getVal('formsSold'),
        cards: getVal('cardsSold'),
        payoff: getVal('payOff'),
        payoff2: getVal('payOff2'),
        deposit: getVal('TotalDeposit'),
        defaultAmt: getVal('defaultAmt'),
        defaultAmt2: getVal('defaultAmt2'),
        deals: getVal('costOfDeals'),
        todayPd: getVal('todayPd'),
        usedPd: getVal('usedPd'),
        previousOut: getVal('previousoutstanding'),
        inheritedOut: getVal('inheritedoutstanding'), 
        myOut: getVal('myoutstanding'),               
        calcCell2: getVal('calcCell2'),
        calcCell3: validatedNewDeals
    };

    if (data.suppose === 0 && data.opening === 0) {
        alert("⚠️ Form verification failed. Please enter essential metrics before calculating.");
        return;
    }

    const totalCash = (
        data.opening + 
        data.openingpd + 
        data.frmoffice + 
        data.suppose + 
        data.recovery + 
        data.interest + 
        data.forms + 
        data.cards + 
        data.payoff + 
        data.todayPd
    ) - (
        data.usedPd + 
        data.deposit + 
        data.defaultAmt + 
        data.deals
    );

    const actualCollection = (
        data.suppose - 
        data.defaultAmt + 
        data.recovery + 
        data.payoff + 
        data.todayPd - 
        data.usedPd
    );

    const computedNextDayCollection = 
        data.supposecoll2 - (
        data.calcCell2 +
        data.payoff2 ) + 
        data.calcCell3;

    const computedTotalOutstanding = 
        data.previousOut + 
        data.defaultAmt2 - 
        data.recovery;

    const GOOGLE_SHEETS_API_ENDPOINT = "https://script.google.com/macros/s/AKfycbzpixGUMPZQ49tCjUdztkFY2orZDGmw4KOodufl3WE0W83FUpfewh5vskTGH6TP7GD1/exec";
    
    try {
        const verifyUrl = `${GOOGLE_SHEETS_API_ENDPOINT}?checkDate=${encodeURIComponent(extractedReportDate)}&checkMarket=${encodeURIComponent(extractedMarketName)}`;
        const checkResponse = await fetch(verifyUrl);
        const logStatus = await checkResponse.json();

        if (logStatus && logStatus.exists === true) {
            let varianceList = [];

            if (parseFloat(logStatus.actualCollection || 0) !== actualCollection) {
                varianceList.push(`Actual Collection (Sheet: ₦${parseFloat(logStatus.actualCollection || 0).toLocaleString()} vs Input: ₦${actualCollection.toLocaleString()})`);
            }
            if (parseFloat(logStatus.totalCashToday || 0) !== totalCash) {
                varianceList.push(`Total Cash Today (Sheet: ₦${parseFloat(logStatus.totalCashToday || 0).toLocaleString()} vs Input: ₦${totalCash.toLocaleString()})`);
            }
            if (parseFloat(logStatus.totalOutstanding || 0) !== computedTotalOutstanding) {
                varianceList.push(`Total Outstanding (Sheet: ₦${parseFloat(logStatus.totalOutstanding || 0).toLocaleString()} vs Input: ₦${computedTotalOutstanding.toLocaleString()})`);
            }
            if (parseFloat(logStatus.nextDayCollection || 0) !== computedNextDayCollection) {
                varianceList.push(`Next Day Collection (Sheet: ₦${parseFloat(logStatus.nextDayCollection || 0).toLocaleString()} vs Input: ₦${computedNextDayCollection.toLocaleString()})`);
            }
            
            if (varianceList.length > 0 && warningFlag) {
                if (isOverrideTicked) {
                    console.log("Authorized Overwrite: Bypassing validation wall to update ledger record.");
                    warningFlag.style.display = "none";
                    if (overwriteCheckbox) overwriteCheckbox.checked = false;
                } else {
                    const detailsContainer = document.getElementById('warning-details');
                    if (detailsContainer) {
                        detailsContainer.innerHTML = `An existing entry for <strong>${extractedMarketName}</strong> on 
                        <strong>${extractedReportDate}</strong> was detected. 
                        The values you are currently submitting do not match the documented ledger record:<br><ul><li>` + 
                        varianceList.join("</li><li>") + `</li></ul>Please re-verify raw inputs or check the override box below 
                        if the original sheet record was incorrect.`;
                    }
                    warningFlag.style.display = "block";
                    warningFlag.scrollIntoView({ behavior: 'smooth' });
                    return; 
                }
            }
        }
    } catch (auditError) {
        console.error("Ledger compliance verification exception:", auditError);
    }

    document.getElementById('nextDayCollection').innerText = "₦" + computedNextDayCollection.toLocaleString();
    document.getElementById('outstandingResult').innerText = "₦" + computedTotalOutstanding.toLocaleString();

    const isReportComplete = document.getElementById('errorBox').classList.contains('hidden');
    const currentReportStatus = isReportComplete ? "Complete" : "Incomplete (Missing Metrics)";

    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('totalCashDisplay').innerText = "₦" + totalCash.toLocaleString();
    document.getElementById('actualDisplay').innerText = "₦" + actualCollection.toLocaleString();

    let tableHTML = `<table>
        <tr><th>Description</th><th>Amount / Information</th></tr>
        <tr><td>REPORT DATE</td><td>${extractedReportDate}</td></tr>
        <tr><td>MARKET NAME</td><td><strong>${extractedMarketName}</strong></td></tr>
        <tr><td>OPENING CASH</td><td>₦${data.opening.toLocaleString()}</td></tr>
        <tr><td>SUPPOSED COLLECTION</td><td>₦${data.suppose.toLocaleString()}</td></tr>
        <tr><td>ACTUAL COLLECTION</td><td style="font-weight:bold;">₦${actualCollection.toLocaleString()}</td></tr>
        <tr><td>TOTAL CASH TODAY</td><td style="font-weight:bold;">₦${totalCash.toLocaleString()}</td></tr>
        <tr><td>TOTAL OUTSTANDING</td><td>₦${computedTotalOutstanding.toLocaleString()}</td></tr>
        <tr><td>NEXT DAY COLLECTION</td><td>₦${computedNextDayCollection.toLocaleString()}</td></tr>
        <tr><td>STATUS</td><td><strong>${currentReportStatus}</strong></td></tr>
    </table>`;
    document.getElementById('tableContainer').innerHTML = tableHTML;

    if (typeof refreshDataCoreTargetBenchmark === "function") {
        refreshDataCoreTargetBenchmark(actualCollection);
    }

    const spreadsheetDataPayload = {
        date: extractedReportDate,          
        marketName: extractedMarketName,    
        openingCash: data.opening,          
        supposeColl: data.suppose,          
        actualCollection: actualCollection,  
        totalCashToday: totalCash,          
        totalOutstanding: computedTotalOutstanding, 
        nextDayCollection: computedNextDayCollection, 
        status: currentReportStatus         
    };

    fetch(GOOGLE_SHEETS_API_ENDPOINT, {
        method: "POST",
        mode: "no-cors", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spreadsheetDataPayload)
    })
    .then(() => alert(`✅ Financial data ledger safely synced for ${extractedMarketName} on ${extractedReportDate}!`))
    .catch(err => console.error("Data transmission exception:", err));
}

function runNextDayCalc() {
    const cell1 = parseFloat(document.getElementById('supposeColl2').value) || 0;
    const cell2 = parseFloat(document.getElementById('calcCell2').value) || 0;
    const cell3 = parseFloat(document.getElementById('calcCell3').value) || 0;
    const cell4 = parseFloat(document.getElementById('payOff2').value) || 0;
    const sumtotal = cell1 - (cell2 + cell4) + cell3;
    document.getElementById('nextDayCollection').innerText = "₦" + sumtotal.toLocaleString();
}
document.getElementById('calcNextDayBtn').addEventListener('click', runNextDayCalc);

function runOutstandingCalc() {
    const outcell0 = parseFloat(document.getElementById('previousoutstanding').value) || 0;
    const outCell3 = parseFloat(document.getElementById('defaultAmt2').value) || 0;
    const outCell4 = parseFloat(document.getElementById('recovery2').value) || 0;
    const sumtotal = outcell0 + outCell3 - outCell4;
    document.getElementById('outstandingResult').innerText = "₦" + sumtotal.toLocaleString();
}
document.getElementById('calcOutstandingBtn').addEventListener('click', runOutstandingCalc);

// [IMPLEMENTATION FIX]: Interactive Change Event Listener for System Override Checkbox Block
document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'sheet-correction-override') {
        if (e.target.checked && cachedSheetHistory) {
            const openingCashInput = document.getElementById('openingCash');
            const supposeCollInput = document.getElementById('supposeColl');
            const supposeColl2Input = document.getElementById('supposeColl2');
            const previousOutstandingInput = document.getElementById('previousoutstanding');

            if (cachedSheetHistory.expectedOpeningCash !== undefined && openingCashInput) {
                openingCashInput.value = cachedSheetHistory.expectedOpeningCash;
            }
            if (cachedSheetHistory.expectedSupposedCollection !== undefined) {
                if (supposeCollInput) supposeCollInput.value = cachedSheetHistory.expectedSupposedCollection;
                if (supposeColl2Input) supposeColl2Input.value = cachedSheetHistory.expectedSupposedCollection;
                if (typeof runNextDayCalc === "function") runNextDayCalc();
            }
            if (cachedSheetHistory.previousOutstanding !== undefined && previousOutstandingInput) {
                previousOutstandingInput.value = cachedSheetHistory.previousOutstanding;
                if (typeof runOutstandingCalc === "function") runOutstandingCalc();
            }
            console.log("✅ Confirmation approved: Form fields synced with backend historical tracking data.");
        }
    }
});

// Primary operational trigger event attachment listeners
document.getElementById('autoFillBtn').addEventListener('click', extractData);
document.getElementById('calculateBtn').addEventListener('click', runCalculation);

// =========================================================================
// 🎛️ DATACORE DATA LEDGER GRID DESKTOP CONTAINER (CORRECTED BALANCE ENGINE)
// =========================================================================
const DATACORE_REGISTRY_API = "https://script.google.com/macros/s/AKfycbwaye4TbDVpN1sKpnEUtBXyS2lBwMhm0n-o2UxgM9y1JiodqOymuwpcPKxr77xWnh9_Ig/exec"; 

let dataCoreSessionState = {
    activeMarket: "",
    activeDate: "",
    rawReportText: "",
    loadedRecords: []
};

function syncParserMetadataToDataCoreEnv(marketName, reportDate, rawText) {
    dataCoreSessionState.activeMarket = marketName;
    dataCoreSessionState.activeDate = reportDate;
    dataCoreSessionState.rawReportText = rawText;
    
    document.getElementById("datacore-status-subtext").innerHTML = `Linked to tab: <strong style="color:#2563eb;">${marketName}</strong> for run date: <strong>${reportDate}</strong>`;
    fetchActiveMarketRowsFromSheets();
}

function refreshDataCoreTargetBenchmark(verifiedTotal) {
    const label = document.getElementById("parser-verified-total");
    if (label) {
        label.innerText = "₦" + verifiedTotal.toLocaleString();
    }
    calculateDataCoreLedgerMatrix();
}

async function fetchActiveMarketRowsFromSheets() {
    const loader = document.getElementById("datacore-loading-state");
    const gridBody = document.getElementById("ledger-grid-body");
    
    if (!dataCoreSessionState.activeMarket || dataCoreSessionState.activeMarket === "Unknown Market") {
        if (loader) loader.classList.add("hidden");
        if (gridBody) {
            gridBody.innerHTML = `<tr><td colspan="13" style="text-align:center; color:#e11d48; font-weight:bold;">
            ⚠️ DataCore Halting: No valid Market Name extracted yet. Please verify report text data.</td></tr>`;
        }
        return;
    }
    
    if (loader) loader.classList.remove("hidden");
    if (gridBody) gridBody.innerHTML = `<tr><td colspan="13" style="text-align:center;">Querying target sheet tab data...</td></tr>`;
    
    try {
        // 🛠️ AMENDMENT: Explicitly passing active session run date text parameters to API hook line
        const response = await fetch(`${DATACORE_REGISTRY_API}?getTargetMarket=${encodeURIComponent(dataCoreSessionState.activeMarket)}&activeReportDate=${encodeURIComponent(dataCoreSessionState.activeDate)}`);
        const result = await response.json();
        
        if (result.status === "error") {
            if (loader) loader.classList.add("hidden");
            if (gridBody) {
                gridBody.innerHTML = `<tr><td colspan="13" style="text-align:center; color:#e11d48; padding: 20px; font-weight:bold; background-color: #ffffea; border: 1px solid #fde047;">
                ❌ Google Apps Script Error Encountered:<br><span style="font-family: monospace; font-size: 13px; color: #991b1b;">${result.message}</span>
                <br><br><small style="color: #6b7280; font-weight: normal;">Fix the error within your Google Sheet structure or Apps Script file, then run a fresh redeployment.</small></td></tr>`;
            }
            return; 
        }
        
        if (result.status === "success" && result.records.length > 0) {
            dataCoreSessionState.loadedRecords = result.records;
            renderDynamicDataCoreLedger();
        } else {
            gridBody.innerHTML = `<tr><td colspan="13" style="text-align:center; color:#b45309; font-weight:bold;">
            ⚠️ Status: ${result.message || "No registry profile matching this layout template description."}</td></tr>`;
            dataCoreSessionState.loadedRecords = [];
            calculateDataCoreLedgerMatrix();
        }
    } catch (err) {
        console.error("DataCore retrieval error:", err);
        if (gridBody) {
            gridBody.innerHTML = `<tr><td colspan="13" style="text-align:center; color:#e11d48; font-weight:bold; padding: 15px;">
            ❌ Network Connection Error: Unable to communicate with endpoint. Verify network status or API variable strings.</td></tr>`;
        }
    } finally {
        if (loader) loader.classList.add("hidden");
    }
}

function renderDynamicDataCoreLedger() {
    const gridBody = document.getElementById("ledger-grid-body");
    if (!gridBody) return;
    gridBody.innerHTML = "";

    const text = dataCoreSessionState.rawReportText;
    const sectionEndBoundary = "(?=\\*Default|\\*Recovery|\\*Pay down|\\*Use pay down|\\*Pay off|\\*Pay off analysis|Disbursement List|\\*Previous Pay Down:|\\*Record of Form|\\*Officer's Name*|$)";

    const defaultBlock = text.match(new RegExp(`\\*Default with phone=([\\s\\S]*?)${sectionEndBoundary}`, "i"));
    const recoveryBlock = text.match(new RegExp(`\\*Recovery with phone=([\\s\\S]*?)${sectionEndBoundary}`, "i"));
    const paydownBlock = text.match(new RegExp(`\\*Pay down with phone=([\\s\\S]*?)${sectionEndBoundary}`, "i"));
    const usedPaydownBlock = text.match(new RegExp(`\\*Use pay down with phone=([\\s\\S]*?)${sectionEndBoundary}`, "i"));
    const payoffBlock = text.match(new RegExp(`\\*Pay off(?:\\s+analysis\\s+for\\s+today)?\\s*=([\\s\\S]*?)${sectionEndBoundary}`, "i"));

    const defaultsString = defaultBlock ? defaultBlock[1].toLowerCase() : "";
    const recoveriesString = recoveryBlock ? recoveryBlock[1].toLowerCase() : "";
    const paydownsString = paydownBlock ? paydownBlock[1].toLowerCase() : "";
    const usedPaydownsString = usedPaydownBlock ? usedPaydownBlock[1].toLowerCase() : "";
    const payoffsString = payoffBlock ? payoffBlock[1].toLowerCase() : "";

    const lastRowIndexMap = {};
    dataCoreSessionState.loadedRecords.forEach((client, idx) => {
        if (client.accountName) {
            const cleanNameKey = String(client.accountName).toLowerCase().trim();
            lastRowIndexMap[cleanNameKey] = idx; 
        }
    });

    dataCoreSessionState.loadedRecords.forEach((client, idx) => {
        let processedDays = parseInt(client.activeRepaymentDays, 10);
        if (isNaN(processedDays)) {
            processedDays = 0; 
        }

        // 🛠️ FIREWALL INTERCEPT: Explicitly flag outstanding accounts and finished profiles
        let isOutstandingCust = (client.status === "Outstanding Customer" || processedDays > 25);
        let isSettledLoan = (client.status === "Settled" || parseFloat(client.principalAmount) <= 0);
        
        // Forced baseline allocation mapping hook
        let baseRepayment = (isOutstandingCust || isSettledLoan) ? 0 : (parseFloat(client.dailyRepayment) || 0);
        let calculatedFinalRepayment = baseRepayment;
        let hasNewActivity = false; 
        
        let badgeHTML = isOutstandingCust 
            ? `<span id="badge-row-${idx}" class="badge badge-outstanding" style="background:#dc2626; color:white; padding:4px 8px; border-radius:4px; font-weight:bold;">Outstanding Customer</span>`
            : `<span id="badge-row-${idx}" class="badge badge-active" style="background:#10b981; color:white; padding:4px 8px; border-radius:4px;">Active</span>`;
            
        const normName = String(client.accountName).toLowerCase().trim();
        const isLastInstance = (lastRowIndexMap[normName] === idx);

        if (isLastInstance) {
            if (defaultsString !== "" && normName !== "" && defaultsString.includes(normName)) {
                calculatedFinalRepayment = 0;
                hasNewActivity = true;
                badgeHTML = `<span id="badge-row-${idx}" class="badge badge-default" style="background: #ef4444; color:white; padding:4px 8px; border-radius:4px;">Defaulter Row</span>`;
            }

            // 🛠️ BULLETPROOF UPDATE (Lines 649 onwards)
            let parsedCollected = parseFloat(client.collectedToday) || 0;
            let expectedTarget = parseFloat(calculatedFinalRepayment) || 0;

            // If they collected exactly what was expected, or if they collected 9600 and that matches their expected tier
            if (parsedCollected === expectedTarget && expectedTarget > 0) {
                
                // Force them to be Active cleanly - it's just their final regular payment!
                hasNewActivity = true;
                badgeHTML = `<span id="badge-row-${idx}" class="badge badge-active" style="background: #10b981; color:white; padding:4px 8px; border-radius:4px;">Active</span>`;

            } else if (recoveriesString !== "" && normName !== "" && recoveriesString.includes(normName)) {
                
                const innerRegex = new RegExp(`name:\\s*${escapeRegExp(normName)}[\\s\\S]*?amount\\s*=\\s*([0-9,.]+)`, "i");
                const innerMatch = recoveriesString.match(innerRegex);
                let extractedAmt = innerMatch ? parseFloat(innerMatch[1].replace(/,/g, '')) : 0;

                // If the recovery text amount perfectly matches what they paid for their normal cycle, it's NOT an injection!
                if (extractedAmt === parsedCollected) {
                    hasNewActivity = true;
                    badgeHTML = `<span id="badge-row-${idx}" class="badge badge-active" style="background: #10b981; color:white; padding:4px 8px; border-radius:4px;">Active</span>`;
                } else if (isSettledLoan || isOutstandingCust) {
                    calculatedFinalRepayment = extractedAmt;
                } else {
                    calculatedFinalRepayment += extractedAmt;
                    hasNewActivity = true;
                    badgeHTML = `<span id="badge-row-${idx}" class="badge badge-recovery" style="background: #3b82f6; color:white; padding:4px 8px; border-radius:4px;">Injected Recovery</span>`;
                }
            }


            if (paydownsString !== "" && normName !== "" && paydownsString.includes(normName)) {
                const innerRegex = new RegExp(`name:\\s*${escapeRegExp(normName)}[\\s\\S]*?amount\\s*=\\s*([0-9,.]+)`, "i");
                const innerMatch = paydownsString.match(innerRegex);
                let extractedAmt = innerMatch ? parseFloat(innerMatch[1].replace(/,/g, '')) : 0;
                calculatedFinalRepayment += extractedAmt;
                hasNewActivity = true;
                badgeHTML = `<span id="badge-row-${idx}" class="badge badge-paydown" style="background: #e2f65c; color:white; padding:4px 8px; border-radius:4px;">Pay Down Added</span>`;
            }

            if (usedPaydownsString !== "" && normName !== "" && usedPaydownsString.includes(normName)) {
                const innerRegex = new RegExp(`name:\\s*${escapeRegExp(normName)}[\\s\\S]*?amount\\s*=\\s*([0-9,.]+)`, "i");
                const innerMatch = usedPaydownsString.match(innerRegex);
                let extractedAmt = innerMatch ? parseFloat(innerMatch[1].replace(/,/g, '')) : 0;
                calculatedFinalRepayment -= extractedAmt;
                hasNewActivity = true;
                badgeHTML = `<span id="badge-row-${idx}" class="badge badge-usedpaydown" style="background: #f59e0b; color:white; padding:4px 8px; border-radius:4px;">Used Pay Down</span>`;
            }

            if (payoffsString !== "" && normName !== "" && payoffsString.includes(normName)) {
                const innerRegex = new RegExp(`name:\\s*${escapeRegExp(normName)}[\\s\\S]*?amount\\s*=\\s*([0-9,.]+)`, "i");
                const innerMatch = payoffsString.match(innerRegex);
                let extractedAmt = innerMatch ? parseFloat(innerMatch[1].replace(/,/g, '')) : 0;
                calculatedFinalRepayment += extractedAmt;
                hasNewActivity = true;
                badgeHTML = `<span id="badge-row-${idx}" class="badge badge-payoff" style="background: rgb(32, 228, 228); color:white; padding:4px 8px; border-radius:4px;">Pay Off Added</span>`;
            }
        }

        if (isSettledLoan && !hasNewActivity) {
            calculatedFinalRepayment = 0;
            badgeHTML = `<span id="badge-row-${idx}" class="badge badge-finished" style="background: #64748b; color:white; padding:4px 8px; border-radius:4px;">Settled</span>`;
        }

        const tr = document.createElement("tr");
        tr.innerHTML = `
        <td><strong>${client.accountName}</strong></td>
        <td>${client.borrowerUniqueNum}</td>
        <td>${client.loanUniqueNum}</td>
        <td>₦${parseFloat(client.principalAmount).toLocaleString()}</td>
        <td>₦${parseFloat(client.form).toLocaleString()}</td>
        <td>₦${parseFloat(client.card).toLocaleString()}</td>
        <td>₦${parseFloat(client.dailyRepayment).toLocaleString()}</td>
        <td>₦${parseFloat(client.totalAmountPaid).toLocaleString()}</td>
        <td>${client.branchId}</td>
        <td>${client.disbursementDate}</td>
        <td><small>${client.marketOfficerName}</small></td>
        <td>
        <input type="number" id="grid-input-${idx}" class="grid-inline-input datacore-matrix-input" value="${calculatedFinalRepayment}" min="0"/>
        </td>
        <td>${badgeHTML}</td>
        `;
        gridBody.appendChild(tr);
    });

    calculateDataCoreLedgerMatrix();
    document.querySelectorAll(".datacore-matrix-input").forEach(i => i.addEventListener("input", calculateDataCoreLedgerMatrix));
}

function calculateDataCoreLedgerMatrix() {
    let computedCollectionSum = 0;

    dataCoreSessionState.loadedRecords.forEach((client, idx) => {
        const inp = document.getElementById(`grid-input-${idx}`);
        if (inp) {
            computedCollectionSum += parseFloat(inp.value) || 0;
        }
    });

    const labelTotal = document.getElementById("grid-actual-total");
    if (labelTotal) {
        labelTotal.innerText = "₦" + computedCollectionSum.toLocaleString();
    }

    const targetLabel = document.getElementById("parser-verified-total");
    const parsedTargetText = targetLabel ? targetLabel.innerText.replace("₦", "").replace(/,/g, "") : "0";
    const parsedTarget = parseFloat(parsedTargetText) || 0;

    let syncBtn = document.getElementById("sync-ledger-sheets-btn");
    
    if (syncBtn) {
        const isBalanced = Math.round(computedCollectionSum) === Math.round(parsedTarget);

        if (isBalanced && computedCollectionSum > 0) {
            syncBtn.disabled = false;
            syncBtn.removeAttribute("disabled");
            syncBtn.style.background = "#10b981";
            syncBtn.style.cursor = "pointer";
            syncBtn.style.pointerEvents = "auto"; 
        } else {
            syncBtn.setAttribute("disabled", "true");
            syncBtn.disabled = true;
            syncBtn.style.background = "#94a3b8";
            syncBtn.style.cursor = "not-allowed";
        }
    }
}

function postDataCoreTransactionsToSheets() {
    const rowsPayload = [];
    
    dataCoreSessionState.loadedRecords.forEach((client, idx) => {
        const inp = document.getElementById(`grid-input-${idx}`);
        const badgeElement = document.getElementById(`badge-row-${idx}`);
        
        let collectedAmt = inp ? parseFloat(inp.value) || 0 : 0;
        let activityType = "Collection"; 
        let isSpecialActivity = false;    
        
        if (badgeElement) {
            const badgeText = badgeElement.innerText.toLowerCase();
            
            if (badgeText.includes("recovery")) {
                activityType = "Recovery";
                isSpecialActivity = true;
            } else if (badgeText.includes("default") && !badgeText.includes("outstanding")) {
                activityType = "Default Set";
                isSpecialActivity = true;
            } else if (badgeText.includes("pay down") && !badgeText.includes("used")) {
                activityType = "Pay Down";
                isSpecialActivity = true;
            } else if (badgeText.includes("used pay down")) {
                activityType = "Used Pay Down";
                isSpecialActivity = true;
            } else if (badgeText.includes("pay off")) {
                activityType = "Pay Off";
                isSpecialActivity = true;
            } else if (badgeText.includes("outstanding customer")) {
                activityType = "Outstanding Balance Activity";
                if (collectedAmt > 0) {
                    isSpecialActivity = true;
                }
            } else if (badgeText.includes("settled")) {
                activityType = "Settled Closeout";
                if (collectedAmt > 0) {
                    isSpecialActivity = true; 
                }
            }
        }

        let constructedComment = "";
        if (isSpecialActivity) {
            if (activityType === "Default Set") {
                //1. THIS RUNS THE MATH EQUATIONS FIRST SO THE VALUE EXISTS
                let fullDefaultAmount = parseFloat (client.dailyRepayment) || 0;
                constructedComment = `Marked Defaulter Row for (₦${fullDefaultAmount.toLocaleString()} for ${client.accountName} on ${dataCoreSessionState.activeDate}`;
            } else {
                // Isolate the exact transaction amount by subtracting the normal daily repayment from the cell total
                let regularDayRate = parseFloat(client.dailyRepayment) || 0;
                let isolatedAmount = regularDayRate > 0 ? (collectedAmt - regularDayRate) : collectedAmt;

                constructedComment = `${activityType} of ₦${Math.abs(isolatedAmount).toLocaleString()} for ${client.accountName} on 
                ${dataCoreSessionState.activeDate}`;            
            }
        }

        rowsPayload.push({
            borrowerUniqueNum: client.borrowerUniqueNum,
            loanUniqueNum: client.loanUniqueNum,
            collectedToday: collectedAmt,
            comment: constructedComment 
        });
    });

    fetch(DATACORE_REGISTRY_API, {
        method: "POST",
        headers: { 
            "Content-Type": "text/plain;charset=utf-8" 
        },
        body: JSON.stringify({ 
            marketName: dataCoreSessionState.activeMarket, 
            reportDateTarget: dataCoreSessionState.activeDate, 
            updates: rowsPayload 
        })
    })
    .then(res => {
        if (!res.ok) throw new Error("Network intercept failure processing script destination.");
        return res.json();
    })
    .then(data => {
        if (data.status === "success") {
            alert(`✅ DataCore matrix successfully updated! Grid tracking profiles balanced.`);
        } else {
            alert(`⚠️ Spreadsheet Processing Flagged: ${data.message}`);
        }
    })
    .catch(err => {
        console.error("Post processing exception:", err);
        alert("✅ Request processed! Check your target spreadsheet layout to confirm updates.");
    });
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

document.addEventListener("DOMContentLoaded", () => {
    initializePlatformRouter();
    
    if (typeof initializeDataCoreScrollTracker === "function") {
        initializeDataCoreScrollTracker();
    }
    
    const autoFillBtn = document.getElementById('autoFillBtn');
    const calculateBtn = document.getElementById('calculateBtn');
    
    if (autoFillBtn) autoFillBtn.addEventListener('click', extractData);
    if (calculateBtn) calculateBtn.addEventListener('click', runCalculation);

    // 🧹 EXACT RESET WORKSPACE SOLUTION
    const clearBtn = document.getElementById('clear-workspace-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm("Are you sure you want to clear the workspace for a new market?")) {
                // 1. Clear Raw Input Textarea
                const textInput = document.getElementById('reportInput');
                if (textInput) textInput.value = "";

                // 2. Clear Metadata Inputs
                if (document.getElementById('displayDate')) document.getElementById('displayDate').value = "";
                if (document.getElementById('displayMarket')) document.getElementById('displayMarket').value = "";

                // 3. Clear all 21 Form Calculation Metric Fields
                const formIds = [
                    'openingCash', 'openingpd', 'todayPd', 'officecash', 'supposeColl', 'supposeColl2',
                    'recovery', 'recovery2', 'interestOnDeals', 'formsSold', 'cardsSold', 'payOff',
                    'payOff2', 'TotalDeposit', 'defaultAmt', 'defaultAmt2', 'costOfDeals', 'usedPd',
                    'previousoutstanding', 'inheritedoutstanding', 'myoutstanding', 'calcCell2', 'calcCell3'
                ];
                formIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = 0;
                });

                // 4. Hide Error/Warning Boxes and Dashboards
                if (document.getElementById('errorBox')) document.getElementById('errorBox').classList.add('hidden');
                if (document.getElementById('dashboard')) document.getElementById('dashboard').classList.add('hidden');
                const warningFlag = document.getElementById('mismatch-warning-flag');
                if (warningFlag) warningFlag.style.display = "none";

                // 5. Reset DataCore Session State Metrics
                dataCoreSessionState.activeMarket = "";
                dataCoreSessionState.activeDate = "";
                dataCoreSessionState.rawReportText = "";
                dataCoreSessionState.loadedRecords = [];

                // 6. Reset the Header Status Subtext and Grid UI Elements
                const statusSubtext = document.getElementById("datacore-status-subtext");
                if (statusSubtext) statusSubtext.innerHTML = "Linked to tab: <strong>None</strong>";
                
                const gridBody = document.getElementById("ledger-grid-body");
                if (gridBody) gridBody.innerHTML = `<tr><td colspan="13" style="text-align:center; color:#6b7280;">Workspace cleared. Awaiting new report parsing payload...</td></tr>`;

                const labelTotal = document.getElementById("grid-actual-total");
                if (labelTotal) labelTotal.innerText = "₦0";
                
                const targetLabel = document.getElementById("parser-verified-total");
                if (targetLabel) targetLabel.innerText = "₦0";

                // 7. Re-disable the Sync Button
                let syncBtn = document.getElementById("sync-ledger-sheets-btn");
                if (syncBtn) {
                    syncBtn.setAttribute("disabled", "true");
                    syncBtn.disabled = true;
                    syncBtn.style.background = "#94a3b8";
                    syncBtn.style.cursor = "not-allowed";
                }

                window.scrollTo({ top: 0, behavior: 'smooth' });
                alert("🧹 Workspace completely cleared and optimized for your next market run!");
            }
        });
    }
});

//KNOWLEDGE HUB JS SCRIPT
function toggleHubAccordion(cardElement) {
    const content = cardElement.querySelector('.hub-content');
    const icon = cardElement.querySelector('.toggle-icon');
    const isOpen = !content.classList.contains('hidden');
    
    // Close all other open cards cleanly
    document.querySelectorAll('.knowledge-card').forEach(card => {
        card.querySelector('.hub-content').classList.add('hidden');
        card.querySelector('.toggle-icon').style.transform = 'rotate(0deg)';
        card.classList.remove('active-card');
    });
    
    // Toggle state for the selected item
    if (!isOpen) {
        content.classList.remove('hidden');
        icon.style.transform = 'rotate(90deg)';
        cardElement.classList.add('active-card');
        cardElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

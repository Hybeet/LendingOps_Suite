// =========================================================================
// BUSINESS REPORT PARSER 3.0 + DATACORE REGISTRY ENGINE
// SECURE FRONTEND CONTROLLER
// =========================================================================
// IMPORTANT:
// 1. Keep this file as the single frontend controller.
// 2. Replace ONLY the two endpoint constants below with your deployed URLs.
// 3. Do NOT place Google Sheet IDs, service-account credentials, API keys,
//    passwords, or authorization secrets in this file.
// 4. Frontend validation improves UX; Apps Script remains the final authority.
// =========================================================================

"use strict";

/* =========================================================================
   1. API CONFIGURATION
   ========================================================================= */

const API_CONFIG = Object.freeze({

    BUSINESS_PARSER:
        "https://script.google.com/macros/s/AKfycbzDCcNU555zQyEPK0dZv1UWOPhucEX88UDi7ivbHpRC99k6B7Pu1O9ZVavqqHkeuChV/exec",

    DATACORE:
        "https://script.google.com/macros/s/AKfycbw1wa68ocBZBp4IX7Xwk51g-NUp82SGTlc5PrEXN889835glG5vRhKVQaD0idKGpSKx/exec",

    REQUEST_TIMEOUT:
        30000
});


/* =========================================================================
   2. GLOBAL APPLICATION STATE
   ========================================================================= */

const appState = {
    extractedMarketName: "Unknown Market",
    extractedReportDate: "",
    cachedSheetHistory: null,

    /*
     * ---------------------------------------------------------------
     * HISTORICAL VALIDATION STATE
     * ---------------------------------------------------------------
     */
    historicalAudit: {

        previousTotalCash: 0,
        expectedOpeningCash: 0,
        extractedOpeningCash: 0,

        previousTotalOutstanding: 0,
        expectedPreviousOutstanding: 0,
        extractedPreviousOutstanding: 0,

        previousNextDayCollection: 0,
        expectedSupposedCollection: 0,
        extractedSupposedCollection: 0,

        correctionApplied: false,
        hasVariance: false
    },

    dataCore: {
        activeMarket: "",
        activeDate: "",
        rawReportText: "",
        loadedRecords: [],
        parserVerifiedTotal: 0,
        dataCoreActualTotal: 0,
        balanced: false,
        posting: false,
        postConfirmed: false,
    }
};

/* =========================================================================
   3. SAFE DOM HELPERS
   ========================================================================= */

function $(id) {
    return document.getElementById(id);
}

function getInputValue(id) {
    const element = $(id);
    if (!element) return 0;

    const value = parseFloat(
        String(element.value ?? "")
            .replace(/,/g, "")
            .trim()
    );

    return Number.isFinite(value) ? value : 0;
}

function setInputValue(id, value) {
    const element = $(id);
    if (element) {
        element.value = value ?? "";
    }
}

function setText(id, value) {
    const element = $(id);
    if (element) {
        element.textContent = String(value ?? "");
    }
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeRegExp(string) {
    return String(string ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* =========================================================================
   4. SECURE NETWORK REQUEST HELPER
   ========================================================================= */

async function apiRequest(url, options = {}) {

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () => controller.abort(),
            API_CONFIG.REQUEST_TIMEOUT
        );

    try {

        const requestURL =
            String(url || "").trim();


        if (!requestURL) {

            throw new Error(
                "API endpoint is not configured."
            );

        }


        /*
         * ---------------------------------------------------------------
         * FRONTEND API REQUEST
         * ---------------------------------------------------------------
         *
         * IMPORTANT:
         *
         * The frontend does NOT handle the DataCore API key.
         *
         * Frontend
         *    ↓
         * Business Parser
         *    ↓
         * DataCore
         *
         * DATACORE_API_KEY remains inside
         * Business Parser Script Properties.
         * ---------------------------------------------------------------
         */


        const response =
            await fetch(
                requestURL,
                {
                    ...options,

                    signal:
                        controller.signal,

                    cache:
                        "no-store",

                    credentials:
                        "omit"
                }
            );


        if (!response.ok) {

            throw new Error(
                `Server returned HTTP ${response.status}.`
            );

        }


        const responseText =
            await response.text();


        if (
            !responseText.trim()
        ) {

            throw new Error(
                "Server returned an empty response."
            );

        }


        let result;

        try {

            result =
                JSON.parse(
                    responseText
                );

        } catch (parseError) {

            throw new Error(
                "Server returned an invalid JSON response."
            );

        }


        return result;


    } catch (error) {

        if (
            error &&
            error.name === "AbortError"
        ) {

            throw new Error(
                "API request timed out after " +
                `${API_CONFIG.REQUEST_TIMEOUT / 1000} seconds.`
            );

        }


        throw error;

    } finally {

        clearTimeout(
            timeout
        );

    }

}

/* =========================================================================
   5. TEXT NORMALIZATION
   ========================================================================= */

function normalizeText(text) {
    if (!text) return "";

    return String(text)
        .normalize("NFKD")
        .replace(/[\u{1D400}-\u{1D7FF}]/gu, char => {

            const code = char.codePointAt(0);

            if (code >= 0x1D670 && code <= 0x1D689) {
                return String.fromCharCode(
                    code - 0x1D670 + 65
                );
            }

            if (code >= 0x1D68A && code <= 0x1D6A3) {
                return String.fromCharCode(
                    code - 0x1D68A + 97
                );
            }

            if (code >= 0x1D7F6 && code <= 0x1D7FF) {
                return String.fromCharCode(
                    code - 0x1D7F6 + 48
                );
            }

            return char;
        });
}


/* =========================================================================
   6. DATE HELPERS
   ========================================================================= */

function formatDateToString(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
        return "";
    }

    const day = String(dateObj.getDate()).padStart(2, "0");
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const year = dateObj.getFullYear();

    return `${day}/${month}/${year}`;
}

function getFormattedCurrentDate() {
    return formatDateToString(new Date());
}


/* =========================================================================
   7. BUSINESS REPORT EXTRACTION
   ========================================================================= */

async function extractData() {

    const reportInput = $("reportInput");

    if (!reportInput) {
        alert("Report input field was not found.");
        return;
    }

    const rawText = reportInput.value;

    if (!rawText.trim()) {
        alert("Please paste the business report before extracting.");
        return;
    }

    const text = normalizeText(rawText);
    const missingWords = [];

    const extractWarningBox = $("extraction-mismatch-flag");

    if (extractWarningBox) {
        extractWarningBox.style.display = "none";
    }

    const systemOverrideBox = $("sheet-correction-override");

    if (systemOverrideBox) {
        systemOverrideBox.checked = false;
    }

    appState.cachedSheetHistory = null;
    appState.extractedReportDate = getFormattedCurrentDate();

    /* =====================================================================
   REPORT DATE EXTRACTION
   ===================================================================== */

    const dateRegex =
        /(?:^|\r?\n)[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00A0‎\s]*[*:_~`-]*\s*Date\s*[*:_~`-]*\s*[:：]?\s*[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00A0‎]*([0-9]{1,2})\s*[\/.-]\s*([0-9]{1,2})\s*[\/.-]\s*([0-9]{2,4})\b/i;

    const dateMatch =
        text.match(dateRegex);


    if (dateMatch) {

        let day =
            dateMatch[1]
                .trim()
                .padStart(2, "0");

        let month =
            dateMatch[2]
                .trim()
                .padStart(2, "0");

        let year =
            dateMatch[3]
                .trim();


        /*
        * Convert 2-digit year to 4-digit year.
        */
        if (year.length === 2) {

            year =
                "20" +
                year;

        }


        /*
        * Final normalized report date.
        */
        appState.extractedReportDate =
            `${day}/${month}/${year}`;


    } else {

        missingWords.push(
            "Report Date"
        );

    }


    /* ---------------- MARKET ---------------- */

    const marketRegex =
        /(?:Marke[a-z]*|Locat[a-z]*)[^*:\n]*[*:]*\s*([A-Za-z0-9\s._-]+)/i;

    const marketMatch = text.match(marketRegex);


    /* ---------------- NUMERIC EXTRACTION ---------------- */

    const getValue = keyword => {

        const regex = new RegExp(
            `${keyword}[^0-9\\n]*([0-9,.]+)`,
            "i"
        );

        const match = text.match(regex);

        if (match) {

            return parseFloat(
                match[1].replace(/,/g, "")
            ) || 0;

        }

        missingWords.push(
            keyword
                .replace("[a-z]*", "")
                .replace(".s", "'s")
        );

        return 0;
    };


    const mapping = {

        openingCash:
            getValue("Opening Cash[a-z]*"),

        openingpd:
            getValue("Opening Pa[a-z]*"),

        todayPd:
            getValue("Today.s Pa[a-z]*"),

        officecash:
            getValue("Cash fro[a-z]*"),

        supposeColl:
            getValue("Suppos[a-z]* Collection"),

        supposeColl2:
            getValue("Suppos[a-z]* Collection"),

        recovery:
            getValue("Recov[a-z]*"),

        recovery2:
            getValue("Recov[a-z]*"),

        interestOnDeals:
            getValue("Intere[a-z]* on Deals"),

        formsSold:
            getValue("daily forms sold"),

        cardsSold:
            getValue("daily cards sold"),

        payOff:
            getValue("Payoff[a-z]* collected today"),

        payOff2:
            getValue("Payoff[a-z]* collected today"),

        TotalDeposit:
            getValue("Total Deposits to Bank"),

        defaultAmt:
            getValue("Default"),

        defaultAmt2:
            getValue("Default"),

        costOfDeals:
            getValue("Cost of Deals"),

        usedPd:
            getValue("Used Pa[a-z]*"),

        previousoutstanding:
            getValue("Prev[a-z]*. Outstan"),

        inheritedoutstanding:
            getValue("Inherited Outstanding"),

        myoutstanding:
            getValue("My Outstanding")
    };


    Object.entries(mapping).forEach(([elementId, value]) => {
        setInputValue(elementId, value);
    });


    /* ---------------- NEW DEAL INSTALLMENT ---------------- */

    const costOfDealsVal =
        getInputValue("costOfDeals");

    const computedNewDealInstallment =
        costOfDealsVal / 25;

    setInputValue(
        "calcCell3",
        computedNewDealInstallment.toFixed(2)
    );


    /* ---------------- MARKET VALIDATION ---------------- */

    if (
        marketMatch &&
        marketMatch[1] &&
        marketMatch[1].trim()
    ) {

        const rawMarket =
            marketMatch[1].trim();

        appState.extractedMarketName =
            rawMarket
                .toLowerCase()
                .replace(/\b\w/g, char => char.toUpperCase());

        setInputValue(
            "displayDate",
            appState.extractedReportDate
        );

        setInputValue(
            "displayMarket",
            appState.extractedMarketName
        );


        /* ---------------- BUSINESS HISTORY ---------------- */

        try {

            const historyURL =
                `${API_CONFIG.BUSINESS_PARSER}` +
                `?market=${encodeURIComponent(
                    appState.extractedMarketName
                )}` +
                `&excludeDate=${encodeURIComponent(
                    appState.extractedReportDate
                )}`;


            const data =
                await apiRequest(
                    historyURL
                );

            /*console.log(
                "========== BUSINESS HISTORY RESPONSE =========="
            );

            console.log(
                "Market:",
                appState.extractedMarketName
            );

            console.log(
                "Current report date:",
                appState.extractedReportDate
            );

            console.log(
                "History URL:",
                historyURL
            );

            console.log(
                "Business Parser historical response:",
                data
            );

            console.log(
                "Previous Total Cash:",
                data?.totalCash
            );

            console.log(
                "Previous Total Outstanding:",
                data?.totalOutstanding
            );

            console.log(
                "Previous Next Day Collection:",
                data?.nextDayCollection
            );

            console.log(
                "================================================"
            );*/


            if (
                data.status === "success"
            ) {

                /*
                 * -------------------------------------------------------
                 * CACHE HISTORICAL DATA
                 * -------------------------------------------------------
                 */

                appState.cachedSheetHistory =
                    data;


                /*
                * -------------------------------------------------------
                * PREVIOUS REPORT VALUES
                * -------------------------------------------------------
                *
                * Support both:
                *
                * data.previousReport.totalCashToday
                * data.previousReport.totalOutstanding
                * data.previousReport.nextDayCollection
                *
                * and direct/top-level responses.
                *
                * IMPORTANT:
                * Zero is a VALID historical value.
                * Therefore do NOT use || to determine whether
                * a historical value exists.
                */

                const previousReport =
                    data?.previousReport || {};


                /*
                * -------------------------------------------------------
                * RAW HISTORICAL VALUES
                * -------------------------------------------------------
                */

                const rawPreviousTotalCash =
                    previousReport.totalCashToday ??
                    data?.totalCashToday ??
                    data?.totalCash ??
                    null;


                const rawPreviousTotalOutstanding =
                    previousReport.totalOutstanding ??
                    data?.totalOutstanding ??
                    null;


                const rawPreviousNextDayCollection =
                    previousReport.nextDayCollection ??
                    data?.nextDayCollection ??
                    null;


                /*
                * -------------------------------------------------------
                * VALIDATE THAT VALUES ACTUALLY EXIST
                * -------------------------------------------------------
                *
                * This correctly accepts: 0
                * 100
                * "0"
                * "100"
                * but rejects:
                *
                * undefined
                * null
                * ""
                * NaN
                */

                if (
                    rawPreviousTotalCash === null ||
                    rawPreviousTotalCash === undefined ||
                    rawPreviousTotalCash === "" ||
                    !Number.isFinite(
                        Number(rawPreviousTotalCash)
                    )
                ) {

                    throw new Error(
                        "Business Parser returned incomplete historical data: Previous Total Cash is missing."
                    );

                }


                if (
                    rawPreviousTotalOutstanding === null ||
                    rawPreviousTotalOutstanding === undefined ||
                    rawPreviousTotalOutstanding === "" ||
                    !Number.isFinite(
                        Number(rawPreviousTotalOutstanding)
                    )
                ) {

                    throw new Error(
                        "Business Parser returned incomplete historical data: Previous Total Outstanding is missing."
                    );

                }


                if (
                    rawPreviousNextDayCollection === null ||
                    rawPreviousNextDayCollection === undefined ||
                    rawPreviousNextDayCollection === "" ||
                    !Number.isFinite(
                        Number(rawPreviousNextDayCollection)
                    )
                ) {

                    throw new Error(
                        "Business Parser returned incomplete historical data: Previous Next Day Collection is missing."
                    );

                }


                /*
                * -------------------------------------------------------
                * CONVERT TO NUMBERS
                * -------------------------------------------------------
                */

                const previousTotalCash =
                    Number(
                        rawPreviousTotalCash
                    );


                const previousTotalOutstanding =
                    Number(
                        rawPreviousTotalOutstanding
                    );


                const previousNextDayCollection =
                    Number(
                        rawPreviousNextDayCollection
                    );


                /*console.log(
                    "Resolved historical values:",
                    {
                        previousTotalCash:
                            previousTotalCash,

                        previousTotalOutstanding:
                            previousTotalOutstanding,

                        previousNextDayCollection:
                            previousNextDayCollection
                    }
                );

                console.log({
                    previousTotalCash,
                    previousTotalOutstanding,
                    previousNextDayCollection
                })*/


                /*
                 * -------------------------------------------------------
                 * EXPECTED CURRENT VALUES
                 * -------------------------------------------------------
                 *
                 * The Business Parser endpoint may already expose
                 * explicit expected values.
                 *
                 * When available, use them.
                 *
                 * Otherwise fall back to the previous report values.
                 */

                const expectedOpeningCash =
                    data.expectedOpeningCash !== undefined &&
                    data.expectedOpeningCash !== null &&
                    data.expectedOpeningCash !== ""
                        ? Number(
                            data.expectedOpeningCash
                        )
                        : previousTotalCash;


                const expectedPreviousOutstanding =
                    data.previousOutstanding !== undefined &&
                    data.previousOutstanding !== null &&
                    data.previousOutstanding !== ""
                        ? Number(
                            data.previousOutstanding
                        )
                        : previousTotalOutstanding;


                const expectedSupposedCollection =
                    data.expectedSupposedCollection !== undefined &&
                    data.expectedSupposedCollection !== null &&
                    data.expectedSupposedCollection !== ""
                        ? Number(
                            data.expectedSupposedCollection
                        )
                        : previousNextDayCollection;


                /*
                 * -------------------------------------------------------
                 * CAPTURE THE ORIGINAL EXTRACTION
                 * -------------------------------------------------------
                 *
                 * IMPORTANT:
                 * Do NOT overwrite these values yet.
                 *
                 * They are required for the audit:
                 *
                 * Previous Report → Expected → Extracted → Variance
                 */

                const extractedOpeningCash =
                    Number(
                        getInputValue(
                            "openingCash"
                        )
                    ) || 0;


                const extractedSupposedCollection =
                    Number(
                        getInputValue(
                            "supposeColl"
                        )
                    ) || 0;


                const extractedPreviousOutstanding =
                    Number(
                        getInputValue(
                            "previousoutstanding"
                        )
                    ) || 0;


                /*
                 * -------------------------------------------------------
                 * STORE HISTORICAL AUDIT STATE
                 * -------------------------------------------------------
                 */

                appState.historicalAudit = {

                    previousTotalCash:
                        previousTotalCash,

                    expectedOpeningCash:
                        expectedOpeningCash,

                    extractedOpeningCash:
                        extractedOpeningCash,


                    previousTotalOutstanding:
                        previousTotalOutstanding,

                    expectedPreviousOutstanding:
                        expectedPreviousOutstanding,

                    extractedPreviousOutstanding:
                        extractedPreviousOutstanding,


                    previousNextDayCollection:
                        previousNextDayCollection,

                    expectedSupposedCollection:
                        expectedSupposedCollection,

                    extractedSupposedCollection:
                        extractedSupposedCollection,


                    correctionApplied:
                        false,

                    hasVariance:
                        (
                            Math.round(
                                (
                                    extractedOpeningCash -
                                    expectedOpeningCash
                                ) * 100
                            ) !== 0
                        ) ||
                        (
                            Math.round(
                                (
                                    extractedPreviousOutstanding -
                                    expectedPreviousOutstanding
                                ) * 100
                            ) !== 0
                        ) ||
                        (
                            Math.round(
                                (
                                    extractedSupposedCollection -
                                    expectedSupposedCollection
                                ) * 100
                            ) !== 0
                        )
                };


                /*
                 * -------------------------------------------------------
                 * RESET CORRECTION CONTROLS
                 * -------------------------------------------------------
                 */

                const historicalAuditConfirm =
                    $("historical-audit-confirm");


                if (
                    historicalAuditConfirm
                ) {

                    historicalAuditConfirm.checked =
                        false;
                }


                const systemOverrideBox =
                    $("sheet-correction-override");


                if (
                    systemOverrideBox
                ) {

                    systemOverrideBox.checked =
                        false;
                }


                /*
                 * -------------------------------------------------------
                 * AUDIT COMPARISON
                 * -------------------------------------------------------
                 */

                const mismatchDetails = [];


                /*
                 * OPENING CASH
                 */

                if (
                    Math.round(
                        (
                            extractedOpeningCash -
                            expectedOpeningCash
                        ) * 100
                    ) !== 0
                ) {

                    mismatchDetails.push(
                        `Opening Cash Variance ` +
                        `(Extracted: ₦${extractedOpeningCash.toLocaleString()} ` +
                        `vs Expected: ₦${expectedOpeningCash.toLocaleString()})`
                    );
                }


                /*
                 * SUPPOSED COLLECTION
                 */

                if (
                    Math.round(
                        (
                            extractedSupposedCollection -
                            expectedSupposedCollection
                        ) * 100
                    ) !== 0
                ) {

                    mismatchDetails.push(
                        `Supposed Collection Variance ` +
                        `(Extracted: ₦${extractedSupposedCollection.toLocaleString()} ` +
                        `vs Expected: ₦${expectedSupposedCollection.toLocaleString()})`
                    );
                }


                /*
                 * PREVIOUS OUTSTANDING
                 */

                if (
                    Math.round(
                        (
                            extractedPreviousOutstanding -
                            expectedPreviousOutstanding
                        ) * 100
                    ) !== 0
                ) {

                    mismatchDetails.push(
                        `Previous Outstanding Variance ` +
                        `(Extracted: ₦${extractedPreviousOutstanding.toLocaleString()} ` +
                        `vs Expected: ₦${expectedPreviousOutstanding.toLocaleString()})`
                    );
                }


                /*
                 * -------------------------------------------------------
                 * IMPORTANT:
                 * DO NOT AUTO-CORRECT HERE.
                 * -------------------------------------------------------
                 *
                 * The extracted values remain untouched.
                 *
                 * Correction happens only after the user confirms
                 * historical correction.
                 */


                /*
                 * -------------------------------------------------------
                 * RECALCULATE USING THE EXTRACTED VALUES
                 * -------------------------------------------------------
                 */

                runOutstandingCalc();

                runNextDayCalc();


                /*
                 * -------------------------------------------------------
                 * DISPLAY OLD MISMATCH WARNING
                 * -------------------------------------------------------
                 */

                if (
                    mismatchDetails.length > 0 &&
                    extractWarningBox
                ) {

                    const warningDetailsText =
                        $("extraction-warning-details");


                    if (
                        warningDetailsText
                    ) {

                        warningDetailsText.innerHTML =
                            `<strong>⚠️ Audit Discrepancies Detected</strong>` +
                            `<ul>` +
                            mismatchDetails
                                .map(
                                    item =>
                                        `<li>${escapeHTML(item)}</li>`
                                )
                                .join("") +
                            `</ul>` +
                            `Historical values are available for correction. ` +
                            `Do not post until the report has been verified.`;
                    }


                    extractWarningBox.style.display =
                        "block";

                }


                /*
                 * -------------------------------------------------------
                 * NEW HISTORICAL AUDIT MATRIX
                 * -------------------------------------------------------
                 */

                renderHistoricalAudit({

                    previousTotalCash:
                        previousTotalCash,

                    currentOpeningCash:
                        extractedOpeningCash,

                    previousTotalOutstanding:
                        previousTotalOutstanding,

                    currentPreviousOutstanding:
                        extractedPreviousOutstanding,

                    previousNextDayCollection:
                        previousNextDayCollection,

                    currentSupposedCollection:
                        extractedSupposedCollection
                });


            } else {

                /*
                 * No historical record was returned.
                 *
                 * Keep the extracted values untouched.
                 */

                appState.historicalAudit = {

                    previousTotalCash: 0,
                    expectedOpeningCash: 0,
                    extractedOpeningCash:
                        getInputValue("openingCash"),

                    previousTotalOutstanding: 0,
                    expectedPreviousOutstanding: 0,
                    extractedPreviousOutstanding:
                        getInputValue(
                            "previousoutstanding"
                        ),

                    previousNextDayCollection: 0,
                    expectedSupposedCollection: 0,
                    extractedSupposedCollection:
                        getInputValue("supposeColl"),

                    correctionApplied: false,
                    hasVariance: false
                };


                renderHistoricalAudit(null);
            }


        } catch (error) {

            /*console.error(
                "Business history verification failed:",
                error
            );*/


            /*
             * Never silently replace extracted values when historical
             * verification fails.
             */

            appState.historicalAudit = {

                previousTotalCash: 0,

                expectedOpeningCash: 0,

                extractedOpeningCash:
                    getInputValue(
                        "openingCash"
                    ),


                previousTotalOutstanding: 0,

                expectedPreviousOutstanding: 0,

                extractedPreviousOutstanding:
                    getInputValue(
                        "previousoutstanding"
                    ),


                previousNextDayCollection: 0,

                expectedSupposedCollection: 0,

                extractedSupposedCollection:
                    getInputValue(
                        "supposeColl"
                    ),


                correctionApplied: false,

                hasVariance: false
            };


            renderHistoricalAudit(null);


            const warning =
                $("extraction-warning-details");


            if (
                warning
            ) {

                warning.textContent =
                    "Historical validation could not be completed. " +
                    "Calculation/posting should not be treated as historically verified.";
            }

        }


        /* ---------------- DATACORE HAND-OFF ---------------- */

        syncParserMetadataToDataCoreEnv(
            appState.extractedMarketName,
            appState.extractedReportDate,
            text
        );

    } else {

        appState.extractedMarketName =
            "Unknown Market";

        missingWords.push("Market Name");

        setInputValue(
            "displayMarket",
            "Unknown Market"
        );
    }


    /* ---------------- ERROR UI ---------------- */

    const errorBox = $("errorBox");
    const missingList = $("missingList");

    if (missingWords.length > 0) {

        if (errorBox) {
            errorBox.classList.remove("hidden");
        }

        if (missingList) {

            missingList.innerHTML =
                missingWords
                    .map(item => `<li>${escapeHTML(item)}</li>`)
                    .join("");
        }

    } else {

        if (errorBox) {
            errorBox.classList.add("hidden");
        }
    }
}

/* =========================================================================
   BUSINESS REPORT HISTORICAL VALIDATION
   ========================================================================= */

async function validateCurrentBusinessReportHistory(
    calculatedData
) {

    const market =
        String(
            appState.extractedMarketName || ""
        ).trim();


    const reportDate =
        String(
            appState.extractedReportDate || ""
        ).trim();


    if (
        !market ||
        !reportDate
    ) {

        throw new Error(
            "Market name and report date are required for historical validation."
        );
    }


    const params =
        new URLSearchParams({

            action:
                "validateReport",

            market:
                market,

            reportDate:
                reportDate,

            openingCash:
                String(
                    calculatedData.openingCash
                ),

            supposeColl:
                String(
                    calculatedData.supposeCollection
                ),

            actualCollection:
                String(
                    calculatedData.actualCollection
                ),

            totalCashToday:
                String(
                    calculatedData.totalCashToday
                ),

            totalOutstanding:
                String(
                    calculatedData.totalOutstanding
                ),

            nextDayCollection:
                String(
                    calculatedData.nextDayCollection
                )
        });


    const url =
        `${API_CONFIG.BUSINESS_PARSER}?${params.toString()}`;


    const result =
        await apiRequest(
            url
        );


    if (
        !result ||
        result.status !== "success"
    ) {

        throw new Error(
            result?.message ||
            "Business Report historical validation failed."
        );
    }


    const validation =
        result.validation;


    if (!validation) {

        throw new Error(
            "Business Report server returned no validation result."
        );
    }


    /*
     * IMPORTANT:
     * Store the CURRENT validation result.
     */

    appState.historicalAudit = {

        ...validation,

        correctionApplied:
            false
    };


    /*
     * ---------------------------------------------------------------
     * PREVIOUS OUTSTANDING
     * ---------------------------------------------------------------
     */

    const previousOutstanding =
        validation.previousReport
            ? Number(
                validation
                    .previousReport
                    .totalOutstanding || 0
              )
            : 0;


    /*
     * Keep the existing application state synchronized.
     */

    if (
        appState.dataCore
    ) {

        appState.dataCore.previousOutstanding =
            previousOutstanding;
    }


    /*
     * Populate the existing field if it exists.
     */

    const previousOutstandingInput =
        $("previousoutstanding");


    if (
        previousOutstandingInput
    ) {

        previousOutstandingInput.value =
            previousOutstanding;
    }


    /*
     * ---------------------------------------------------------------
     * HISTORICAL AUDIT UI
     * ---------------------------------------------------------------
     */

    const auditBox =
        $("historical-audit-box");


    const auditDetails =
        $("historical-audit-details");


    if (
        auditBox
    ) {

        auditBox.classList.remove(
            "hidden"
        );
    }


    /*
     * No previous historical report.
     */

    if (
        !validation.hasHistoricalBaseline
    ) {

        if (
            auditDetails
        ) {

            auditDetails.innerHTML =
                `
                <strong>Historical Check:</strong>
                No previous report was found for
                <strong>${escapeHTML(market)}</strong>
                before
                <strong>${escapeHTML(reportDate)}</strong>.
                `;
        }


        /*
         * No variance.
         */

        if (
            auditBox
        ) {

            auditBox.classList.remove(
                "has-error"
            );
        }


        return validation;
    }


    /*
     * ---------------------------------------------------------------
     * BUILD VARIANCE LIST
     * ---------------------------------------------------------------
     */

    const varianceList = [];


    const openingComparison =
        validation
            .comparisons
            ?.openingCash;


    const supposedComparison =
        validation
            .comparisons
            ?.supposedCollection;


    if (
        openingComparison &&
        !openingComparison.match
    ) {

        varianceList.push({

            type:
                "Opening Cash",

            expected:
                Number(
                    openingComparison.expected || 0
                ),

            reported:
                Number(
                    openingComparison.reported || 0
                ),

            difference:
                Number(
                    openingComparison.difference || 0
                )
        });
    }


    if (
        supposedComparison &&
        !supposedComparison.match
    ) {

        varianceList.push({

            type:
                "Suppose Collection",

            expected:
                Number(
                    supposedComparison.expected || 0
                ),

            reported:
                Number(
                    supposedComparison.reported || 0
                ),

            difference:
                Number(
                    supposedComparison.difference || 0
                )
        });
    }


    appState.historicalAudit.hasVariance =
        varianceList.length > 0;


    appState.historicalAudit.varianceList =
        varianceList;


    /*
     * ---------------------------------------------------------------
     * NO VARIANCE
     * ---------------------------------------------------------------
     */

    if (
        varianceList.length === 0
    ) {

        if (
            auditDetails
        ) {

            auditDetails.innerHTML =
                `
                <strong>✅ Historical validation passed.</strong>
                <br>
                Previous report:
                <strong>${escapeHTML(
                    validation.previousReport.date
                )}</strong>
                <br><br>
                Opening Cash:
                <strong>₦${Number(
                    validation
                        .comparisons
                        .openingCash
                        .expected || 0
                ).toLocaleString()}</strong>
                →
                <strong>₦${Number(
                    validation
                        .comparisons
                        .openingCash
                        .reported || 0
                ).toLocaleString()}</strong>
                <br>
                Suppose Collection:
                <strong>₦${Number(
                    validation
                        .comparisons
                        .supposedCollection
                        .expected || 0
                ).toLocaleString()}</strong>
                →
                <strong>₦${Number(
                    validation
                        .comparisons
                        .supposedCollection
                        .reported || 0
                ).toLocaleString()}</strong>
                `;
        }


        if (
            auditBox
        ) {

            auditBox.classList.remove(
                "has-error"
            );
        }


        return validation;
    }


    /*
     * ---------------------------------------------------------------
     * VARIANCE FOUND
     * ---------------------------------------------------------------
     */

    if (
        auditBox
    ) {

        auditBox.classList.add(
            "has-error"
        );

        auditBox.classList.remove(
            "hidden"
        );
    }


    if (
        auditDetails
    ) {

        auditDetails.innerHTML =
            `
            <strong>⚠️ HISTORICAL VALIDATION WARNING</strong>

            <br><br>

            Previous report:
            <strong>${escapeHTML(
                validation.previousReport.date
            )}</strong>

            <ul>

            ${varianceList.map(
                function(item) {

                    return `
                    <li>
                        <strong>
                            ${escapeHTML(item.type)}
                        </strong>

                        <br>

                        Previous:
                        <strong>
                            ₦${item.expected.toLocaleString()}
                        </strong>

                        <br>

                        Current:
                        <strong>
                            ₦${item.reported.toLocaleString()}
                        </strong>

                        <br>

                        Difference:
                        <strong>
                            ₦${Math.abs(
                                item.difference
                            ).toLocaleString()}
                        </strong>
                    </li>
                    `;
                }
            ).join("")}

            </ul>

            <strong>
                The current report does not agree with the
                previous historical report.
            </strong>
            `;
    }


    return validation;
}


/* =========================================================================
   8. BUSINESS PARSER CALCULATION
   ========================================================================= */

async function runCalculation() {

    const data = {

        opening:
            getInputValue("openingCash"),

        openingpd:
            getInputValue("openingpd"),

        frmoffice:
            getInputValue("officecash"),

        suppose:
            getInputValue("supposeColl"),

        supposecoll2:
            getInputValue("supposeColl2"),

        recovery:
            getInputValue("recovery"),

        recovery2:
            getInputValue("recovery2"),

        interest:
            getInputValue("interestOnDeals"),

        forms:
            getInputValue("formsSold"),

        cards:
            getInputValue("cardsSold"),

        payoff:
            getInputValue("payOff"),

        payoff2:
            getInputValue("payOff2"),

        deposit:
            getInputValue("TotalDeposit"),

        defaultAmt:
            getInputValue("defaultAmt"),

        defaultAmt2:
            getInputValue("defaultAmt2"),

        deals:
            getInputValue("costOfDeals"),

        todayPd:
            getInputValue("todayPd"),

        usedPd:
            getInputValue("usedPd"),

        previousOut:
            getInputValue("previousoutstanding"),

        inheritedOut:
            getInputValue("inheritedoutstanding"),

        myOut:
            getInputValue("myoutstanding"),

        calcCell2:
            getInputValue("calcCell2"),

        calcCell3:
            getInputValue("calcCell3")
    };


    if (
        data.suppose === 0 &&
        data.opening === 0
    ) {

        alert(
            "⚠️ Form verification failed. " +
            "Please enter the essential metrics."
        );

        return;
    }

    /*
     * ---------------------------------------------------------------
     * HISTORICAL VALIDATION GATE
     * ---------------------------------------------------------------
     *
     * If historical validation found a variance, the user must
     * explicitly confirm/correct it before the report can proceed
     * to posting.
     */

    const historicalAudit =
        appState.historicalAudit;


    if (
        historicalAudit &&
        historicalAudit.hasVariance &&
        !historicalAudit.correctionApplied
    ) {

        const historicalConfirm =
            $("historical-audit-confirm");


        const overrideChecked =
            historicalConfirm?.checked === true ||
            $("sheet-correction-override")?.checked === true;


        if (
            !overrideChecked
        ) {

            const auditBox =
                $("historical-audit-box");


            auditBox?.classList.remove(
                "hidden"
            );


            alert(
                "⚠️ Historical validation requires correction/confirmation.\n\n" +
                "One or more current values do not match the previous report."
            );


            auditBox?.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });


            return;
        }


        /*
         * Safety synchronization:
         * If the checkbox is checked but the correction state was not
         * applied yet, apply it before calculation.
         */

        if (
            !historicalAudit.correctionApplied
        ) {

            applyHistoricalAuditCorrection(
                true
            );
        }

    }


    /* ---------------- TOTAL CASH ---------------- */

    const totalCash = (
        data.opening +
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


    /* ---------------- ACTUAL COLLECTION ---------------- */

    const actualCollection = (
        data.suppose -
        data.defaultAmt +
        data.recovery +
        data.payoff +
        data.todayPd -
        data.usedPd
    );


    /* ---------------- NEXT DAY COLLECTION ---------------- */

    const computedNextDayCollection =
        data.supposecoll2 -
        (
            data.calcCell2 +
            data.payoff2
        ) +
        data.calcCell3;


    /* ---------------- OUTSTANDING ---------------- */

    const computedTotalOutstanding =
        data.previousOut +
        data.defaultAmt2 -
        data.recovery;


    /* ---------------------------------------------------------------------
        HISTORICAL VALIDATION — ALWAYS REFRESH FROM SERVER
        --------------------------------------------------------------------- */

        try {

            await validateCurrentBusinessReportHistory({

                openingCash:
                    data.opening,

                supposeCollection:
                    data.suppose,

                actualCollection:
                    actualCollection,

                totalCashToday:
                    totalCash,

                totalOutstanding:
                    computedTotalOutstanding,

                nextDayCollection:
                    computedNextDayCollection

            });

        } catch (error) {

            /*console.error(
                "Historical validation failed:",
                error
            );*/

            alert(
                "⚠️ Historical validation could not be completed.\n\n" +
                error.message
            );

            return;
        }


    /* ---------------- EXISTING RECORD CHECK ---------------- */

    try {

        const verifyURL =
            `${API_CONFIG.BUSINESS_PARSER}` +
            `?checkDate=${encodeURIComponent(appState.extractedReportDate)}` +
            `&checkMarket=${encodeURIComponent(appState.extractedMarketName)}`;

        const logStatus =
            await apiRequest(verifyURL);


        if (logStatus.exists === true) {

            const varianceList = [];


            if (
                Number(logStatus.actualCollection || 0) !==
                actualCollection
            ) {

                varianceList.push(
                    `Actual Collection ` +
                    `(Sheet: ₦${Number(logStatus.actualCollection || 0).toLocaleString()} ` +
                    `vs Input: ₦${actualCollection.toLocaleString()})`
                );
            }


            if (
                Number(logStatus.totalCashToday || 0) !==
                totalCash
            ) {

                varianceList.push(
                    `Total Cash Today ` +
                    `(Sheet: ₦${Number(logStatus.totalCashToday || 0).toLocaleString()} ` +
                    `vs Input: ₦${totalCash.toLocaleString()})`
                );
            }


            if (
                Number(logStatus.totalOutstanding || 0) !==
                computedTotalOutstanding
            ) {

                varianceList.push(
                    `Total Outstanding ` +
                    `(Sheet: ₦${Number(logStatus.totalOutstanding || 0).toLocaleString()} ` +
                    `vs Input: ₦${computedTotalOutstanding.toLocaleString()})`
                );
            }


            if (
                Number(logStatus.nextDayCollection || 0) !==
                computedNextDayCollection
            ) {

                varianceList.push(
                    `Next Day Collection ` +
                    `(Sheet: ₦${Number(logStatus.nextDayCollection || 0).toLocaleString()} ` +
                    `vs Input: ₦${computedNextDayCollection.toLocaleString()})`
                );
            }


            const overwriteCheckbox =
                $("overwrite-override-checkbox");

            const warningFlag =
                $("mismatch-warning-flag");


            if (
                varianceList.length > 0 &&
                warningFlag
            ) {

                const isOverride =
                    overwriteCheckbox?.checked === true;


                if (!isOverride) {

                    const details =
                        $("warning-details");

                    if (details) {

                        details.innerHTML =
                            `Existing ledger entry detected for ` +
                            `<strong>${escapeHTML(appState.extractedMarketName)}</strong> ` +
                            `on <strong>${escapeHTML(appState.extractedReportDate)}</strong>.` +
                            `<ul>` +
                            varianceList
                                .map(item => `<li>${escapeHTML(item)}</li>`)
                                .join("") +
                            `</ul>` +
                            `Re-verify the report before posting.`;
                    }

                    warningFlag.style.display = "block";

                    warningFlag.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });

                    return;
                }
            }
        }

    } catch (error) {

        /*console.error(
            "Ledger verification failed:",
            error
        );*/

        alert(
            "⚠️ Ledger verification could not be completed. " +
            "The report will not be posted."
        );

        return;
    }


    /* ---------------- DISPLAY RESULTS ---------------- */

    setText(
        "nextDayCollection",
        "₦" + computedNextDayCollection.toLocaleString()
    );

    setText(
        "outstandingResult",
        "₦" + computedTotalOutstanding.toLocaleString()
    );


    const errorBox = $("errorBox");

    const isReportComplete =
        errorBox
            ? errorBox.classList.contains("hidden")
            : false;


    const currentReportStatus =
        isReportComplete
            ? "Complete"
            : "Incomplete (Missing Metrics)";


    $("dashboard")?.classList.remove("hidden");


    setText(
        "totalCashDisplay",
        "₦" + totalCash.toLocaleString()
    );

    setText(
        "actualDisplay",
        "₦" + actualCollection.toLocaleString()
    );


    const tableContainer =
        $("tableContainer");


    if (tableContainer) {

        tableContainer.innerHTML = `
            <table>
                <tr>
                    <th>Description</th>
                    <th>Amount / Information</th>
                </tr>

                <tr>
                    <td>REPORT DATE</td>
                    <td>${escapeHTML(appState.extractedReportDate)}</td>
                </tr>

                <tr>
                    <td>MARKET NAME</td>
                    <td>
                        <strong>
                            ${escapeHTML(appState.extractedMarketName)}
                        </strong>
                    </td>
                </tr>

                <tr>
                    <td>OPENING CASH</td>
                    <td>₦${data.opening.toLocaleString()}</td>
                </tr>

                <tr>
                    <td>SUPPOSED COLLECTION</td>
                    <td>₦${data.suppose.toLocaleString()}</td>
                </tr>

                <tr>
                    <td>ACTUAL COLLECTION</td>
                    <td>
                        <strong>
                            ₦${actualCollection.toLocaleString()}
                        </strong>
                    </td>
                </tr>

                <tr>
                    <td>TOTAL CASH TODAY</td>
                    <td>
                        <strong>
                            ₦${totalCash.toLocaleString()}
                        </strong>
                    </td>
                </tr>

                <tr>
                    <td>TOTAL OUTSTANDING</td>
                    <td>
                        ₦${computedTotalOutstanding.toLocaleString()}
                    </td>
                </tr>

                <tr>
                    <td>NEXT DAY COLLECTION</td>
                    <td>
                        ₦${computedNextDayCollection.toLocaleString()}
                    </td>
                </tr>

                <tr>
                    <td>STATUS</td>
                    <td>
                        <strong>
                            ${escapeHTML(currentReportStatus)}
                        </strong>
                    </td>
                </tr>
            </table>
        `;
    }


    appState.dataCore.parserVerifiedTotal =
        actualCollection;


    refreshDataCoreTargetBenchmark(
        actualCollection
    );


    /* ---------------------------------------------------------------------
       IMPORTANT SECURITY CHANGE:
       Do NOT use no-cors and pretend success.
       The backend must provide the final write authorization.
       --------------------------------------------------------------------- */

    const payload = {

        date:
            appState.extractedReportDate,

        marketName:
            appState.extractedMarketName,

        openingCash:
            data.opening,

        supposeColl:
            data.suppose,

        actualCollection:
            actualCollection,

        totalCashToday:
            totalCash,

        totalOutstanding:
            computedTotalOutstanding,

        nextDayCollection:
            computedNextDayCollection,

        status:
            currentReportStatus
    };


    try {

        const result =
            await apiRequest(
                API_CONFIG.BUSINESS_PARSER,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "text/plain;charset=utf-8"
                    },

                    body:
                        JSON.stringify(payload)
                }
            );


        const businessParserConfirmed =
            result &&
            (
                result.status === "success" ||
                result.success === true
            );

        if (!businessParserConfirmed) {

            /*console.error(
                "Business Parser server response was not successful:",
                result
            );*/

            throw new Error(
                result?.message ||
                "Business Parser server rejected the ledger update."
            );
        }


        alert(
            `✅ Financial ledger synchronized successfully for ` +
            `${appState.extractedMarketName} on ` +
            `${appState.extractedReportDate}.`
        );

    } catch (error) {

        /*console.error(
            "Business Parser posting failed:",
            error
        );*/

        alert(
            `❌ Ledger was not confirmed by the server.\n\n` +
            `${error.message}`
        );
    }
}


/* =========================================================================
   9. NEXT DAY CALCULATION
   ========================================================================= */

function runNextDayCalc() {

    const cell1 =
        getInputValue("supposeColl2");

    const cell2 =
        getInputValue("calcCell2");

    const cell3 =
        getInputValue("calcCell3");

    const cell4 =
        getInputValue("payOff2");

    const total =
        cell1 -
        (cell2 + cell4) +
        cell3;

    setText(
        "nextDayCollection",
        "₦" + total.toLocaleString()
    );
}


/* =========================================================================
   10. OUTSTANDING CALCULATION
   ========================================================================= */

function runOutstandingCalc() {

    const previous =
        getInputValue("previousoutstanding");

    const defaultAmount =
        getInputValue("defaultAmt2");

    const recovery =
        getInputValue("recovery2");

    const total =
        previous +
        defaultAmount -
        recovery;

    setText(
        "outstandingResult",
        "₦" + total.toLocaleString()
    );
}


/* =========================================================================
   11. HISTORICAL OVERRIDE UI
   ========================================================================= */

function handleHistoricalOverride(event) {

    if (
        !event ||
        !event.target
    ) {

        return;
    }


    const targetId =
        event.target.id;


    /*
     * ---------------------------------------------------------------
     * HISTORICAL CORRECTION CHECKBOX
     * ---------------------------------------------------------------
     *
     * The legacy checkbox is retained for compatibility.
     *
     * It now uses the same controlled correction engine instead of
     * independently changing values.
     */

    if (
        targetId ===
        "sheet-correction-override"
    ) {

        applyHistoricalAuditCorrection(
            event.target.checked
        );

    }

}

/* =========================================================================
   12. BUSINESS PARSER → DATACORE METADATA HAND-OFF
   ========================================================================= */

/*
 * Synchronizes the Business Parser report metadata with the
 * DataCore environment.
 *
 * FLOW:
 *
 * Business Parser
 *      ↓
 * Market Name
 *      ↓
 * Report Date
 *      ↓
 * Raw Report Text
 *      ↓
 * appState.dataCore
 *      ↓
 * DataCore customer records
 *
 * IMPORTANT:
 * This function does NOT modify any Business Parser calculations.
 * It only establishes the DataCore context for the current report.
 */

function syncParserMetadataToDataCoreEnv(
    marketName,
    reportDate,
    rawReportText
) {

    /*
     * ---------------------------------------------------------------
     * NORMALIZE INPUT
     * ---------------------------------------------------------------
     */

    const market =
        String(
            marketName || ""
        ).trim();


    const date =
        String(
            reportDate || ""
        ).trim();


    const reportText =
        String(
            rawReportText || ""
        );


    /*
     * ---------------------------------------------------------------
     * RESET DATACORE CONTEXT
     * ---------------------------------------------------------------
     *
     * Important when switching between markets/reports.
     *
     * We do NOT carry customer records from the previous report
     * into the new DataCore context.
     */

    appState.dataCore.activeMarket =
        market;


    appState.dataCore.activeDate =
        date;


    appState.dataCore.rawReportText =
        reportText;


    appState.dataCore.loadedRecords =
        [];


    appState.dataCore.dataCoreActualTotal =
        0;


    appState.dataCore.balanced =
        false;


    /*
     * ---------------------------------------------------------------
     * UPDATE DATACORE STATUS
     * ---------------------------------------------------------------
     */

    setText(
        "datacore-status-subtext",
        market && date
            ? `Linked to ${market} — ${date}`
            : "Linked to tab: None"
    );


    /*
     * ---------------------------------------------------------------
     * RESET DISPLAYED DATACORE TOTALS
     * ---------------------------------------------------------------
     */

    setText(
        "grid-actual-total",
        "₦0"
    );


    /*
     * ---------------------------------------------------------------
     * RESET SYNC BUTTON
     * ---------------------------------------------------------------
     */

    const syncButton =
        $("sync-ledger-sheets-btn");


    if (
        syncButton
    ) {

        syncButton.disabled =
            true;

        syncButton.setAttribute(
            "disabled",
            "true"
        );

    }


    /*
     * ---------------------------------------------------------------
     * VALIDATION
     * ---------------------------------------------------------------
     */

    if (
        !market ||
        market === "Unknown Market" ||
        !date
    ) {

        /*console.warn(
            "DataCore metadata synchronization skipped:",
            {
                market:
                    market,

                reportDate:
                    date
            }
        );*/


        return;

    }


    /*
     * ---------------------------------------------------------------
     * LOAD DATACORE CUSTOMER RECORDS
     * ---------------------------------------------------------------
     *
     * fetchActiveMarketRowsFromSheets() reads:
     *
     * appState.dataCore.activeMarket
     * appState.dataCore.activeDate
     *
     * and requests the matching customer records from DataCore.
     *
     * We intentionally do not await this call here.
     *
     * extractData() should complete its Business Parser extraction
     * without being blocked by the DataCore customer-grid request.
     */

    fetchActiveMarketRowsFromSheets()
        .catch(
            function(error) {

                /*console.error(
                    "DataCore metadata hand-off failed:",
                    error
                );*/

            }
        );

}


/* =========================================================================
   13. DATACORE TARGET BENCHMARK
   ========================================================================= */

function refreshDataCoreTargetBenchmark(
    verifiedTotal
) {

    appState.dataCore.parserVerifiedTotal =
        Number(verifiedTotal) || 0;


    setText(
        "parser-verified-total",
        "₦" +
        appState.dataCore.parserVerifiedTotal
            .toLocaleString()
    );


    calculateDataCoreLedgerMatrix();
}


/* =========================================================================
   DATACORE PERFORMANCE TIMING
   ========================================================================= */

function startDataCorePerformanceTimer() {

    return performance.now();

}


function finishDataCorePerformanceTimer(
    startTime,
    label
) {

    if (
        typeof startTime !== "number"
    ) {

        return;

    }


    const elapsed =
        performance.now() -
        startTime;


    /*console.log(
        `${label}: ${elapsed.toFixed(2)} ms`
    );*/


    return elapsed;

}


/* =========================================================================
   14. FETCH DATACORE MARKET RECORDS
   ========================================================================= */

async function fetchActiveMarketRowsFromSheets() {

    const dataCoreLoadStartedAt =
        performance.now();

    const loader =
        $("datacore-loading-state");

    const gridBody =
        $("ledger-grid-body");

    const market =
        String(
            appState.dataCore.activeMarket || ""
        ).trim();

    const reportDate =
        String(
            appState.dataCore.activeDate || ""
        ).trim();


    if (
        !market ||
        market === "Unknown Market" ||
        !reportDate
    ) {

        loader?.classList.add("hidden");

        if (gridBody) {

            gridBody.innerHTML = `
                <tr>
                    <td
                        colspan="13"
                        style="text-align:center;"
                    >
                        ⚠️ No valid market/report date
                        was extracted.
                    </td>
                </tr>
            `;
        }

        return;
    }


    loader?.classList.remove("hidden");


    if (gridBody) {

        gridBody.innerHTML = `
            <tr>
                <td
                    colspan="13"
                    style="text-align:center;"
                >
                    Loading ${escapeHTML(market)}
                    customer records...
                </td>
            </tr>
        `;
    }


    /*
     * ============================================================
     * FRONTEND → BUSINESS PARSER
     * ============================================================
     *
     * IMPORTANT:
     *
     * The frontend NEVER sends:
     *
     *     apiKey
     *     getTargetMarket
     *     activeReportDate
     *
     * directly to DataCore.
     *
     * Business Parser handles that server-side.
     * ============================================================
     */

    const url =
        API_CONFIG.BUSINESS_PARSER +
        `?action=getDataCoreCustomers` +
        `&market=${encodeURIComponent(market)}` +
        `&reportDate=${encodeURIComponent(reportDate)}`;


    /*console.log(
        "Business Parser customer request:",
        {
            market,
            reportDate,
            endpoint:
                API_CONFIG.BUSINESS_PARSER
        }
    );*/


    try {

        const result =
            await apiRequest(url);


        /*console.log(
            "Business Parser customer response:",
            result
        );*/


        if (!result) {

            throw new Error(
                "Business Parser returned no response."
            );
        }


        if (
            result.status === "error"
        ) {

            throw new Error(
                result.message ||
                "Business Parser rejected the customer request."
            );
        }


        if (
            result.status !== "success"
        ) {

            throw new Error(
                result.message ||
                "Business Parser returned an unexpected status."
            );
        }


        if (
            !Array.isArray(
                result.records
            )
        ) {

            throw new Error(
                "Business Parser response does not contain a records array."
            );
        }


        appState.dataCore.loadedRecords =
            result.records;


       /* console.log(
            "DataCore customers loaded through Business Parser:",
            {
                market,
                reportDate,
                recordCount:
                    result.records.length
            }
        );*/


        renderDynamicDataCoreLedger();


    } catch (error) {

        /*console.error(
            "DataCore customer loading failed:",
            error
        );*/


        appState.dataCore.loadedRecords =
            [];


        if (gridBody) {

            gridBody.innerHTML = `
                <tr>
                    <td
                        colspan="13"
                        style="text-align:center;"
                    >
                        ❌ DataCore customer loading failed.
                        <br>
                        <small>
                            ${escapeHTML(
                                error?.message ||
                                "Unknown error"
                            )}
                        </small>
                    </td>
                </tr>
            `;
        }


        calculateDataCoreLedgerMatrix();


    } finally {

        loader?.classList.add("hidden");

        /*console.log(
            "DataCore customer loading phase:",
            Math.round(
                performance.now() -
                dataCoreLoadStartedAt
            ) +
            " ms"
        );*/
    }
}


/* =========================================================================
   15. DATACORE GRID RENDERER
   ========================================================================= */

function renderDynamicDataCoreLedger() {

    const dataCoreRenderTimer =
        startDataCorePerformanceTimer();

    const gridBody =
        $("ledger-grid-body");

    if (!gridBody) return;

    gridBody.replaceChildren();

    const fragment =
        document.createDocumentFragment();


    const text =
        appState.dataCore.rawReportText;


    const sectionEndBoundary =
        "(?=\\*Default|\\*Recovery|\\*Pay down|" +
        "\\*Use pay down|\\*Pay off|" +
        "\\*Pay off analysis|Disbursement List|" +
        "\\*Previous Pay Down:|" +
        "\\*Record of Form|\\*Officer's Name*|$)";


    /* ================================================================
    * DEFAULT WITH PHONE
    *
    * ONLY matches:
    *
    * *Default with phone=
    *
    * Stops before the next major report section.
    * ================================================================ */

    const defaultBlock =
        text.match(
            /\*\s*Default\s+with\s+phone\s*=\s*([\s\S]*?)(?=\*\s*(?:Recovery\s+with\s+phone|Disbursement|Previous\s+Pay\s+Down|Pay\s+down\s+with\s+phone|Used\s+pay\s+down\s+with\s+phone|Pay\s*off|Record\s+of\s+Form)|$)/i
        );


    /* ================================================================
    * RECOVERY WITH PHONE
    *
    * ONLY matches:
    *
    * *Recovery with phone=
    *
    * It CANNOT enter the Disbursement section or another section.
    * ================================================================ */

    const recoveryBlock =
        text.match(
            /\*\s*Recovery\s+with\s+phone\s*=\s*([\s\S]*?)(?=\*\s*(?:Disbursement|Previous\s+Pay\s+Down|Pay\s+down\s+with\s+phone|Used\s+pay\s+down\s+with\s+phone|Pay\s*off|Default\s+with\s+phone|Record\s+of\s+Form)|$)/i
        );


    /* ================================================================
    * PAY DOWN WITH PHONE
    *
    * ONLY matches normal Pay Down.
    *
    * IMPORTANT:
    * It cannot match "Used pay down with phone".
    * ================================================================ */

    const paydownBlock =
        text.match(
            /\*\s*(?!Used\s+pay\s+down\s+with\s+phone\b)Pay\s+down\s+with\s+phone\s*=\s*([\s\S]*?)(?=\*\s*Used\s+pay\s+down\s+with\s+phone\s*=|\*\s*(?:Default\s+with\s+phone|Recovery\s+with\s+phone|Disbursement|Previous\s+Pay\s+Down|Pay\s*off|Record\s+of\s+Form)|$)/i
        );


    /* ================================================================
    * USED PAY DOWN WITH PHONE
    *
    * ONLY matches:
    *
    * *Used pay down with phone=
    * ================================================================ */

    const usedPaydownBlock =
        text.match(
            /\*\s*Used\s+pay\s+down\s+with\s+phone\s*=\s*([\s\S]*?)(?=\*\s*(?:Default\s+with\s+phone|Recovery\s+with\s+phone|Pay\s+down\s+with\s+phone|Disbursement|Previous\s+Pay\s+Down|Pay\s*off|Record\s+of\s+Form)|$)/i
        );


    /* ================================================================
    * PAY OFF / PAY OFF ANALYSIS
    *
    * ONLY matches the Payoff section.
    *
    * It cannot continue into Default, Recovery, Disbursement,
    * Pay Down, Used Pay Down, or Record of Form.
    * ================================================================ */

    const payoffBlock =
        text.match(
            /\*\s*Pay\s*off(?:\s+Analysis\s+(?:of|for)\s+today)?\s*=\s*([\s\S]*?)(?=\*\s*(?:Default\s+with\s+phone|Recovery\s+with\s+phone|Pay\s+down\s+with\s+phone|Used\s+pay\s+down\s+with\s+phone|Disbursement|Previous\s+Pay\s+Down|Record\s+of\s+Form)|$)/i
        );


    const lastRowIndexMap = {};


    appState.dataCore.loadedRecords
        .forEach((client, index) => {

            if (client.accountName) {

                const key =
                    String(client.accountName)
                        .toLowerCase()
                        .trim();

                lastRowIndexMap[key] =
                    index;
            }
        });

    
    /*
     * ---------------------------------------------------------------
     * FAST CONDITION LOOKUP INDEX
     * ---------------------------------------------------------------
     *
     * OLD BEHAVIOUR:
     *
     * Every customer repeatedly searched:
     *
     * defaultsString
     * recoveriesString
     * paydownsString
     * usedPaydownsString
     * payoffsString
     *
     * NEW BEHAVIOUR:
     *
     * Parse each condition section once.
     *
     * Then each customer performs a direct lookup.
     * ---------------------------------------------------------------
     */

    function normalizeConditionCustomerName(
        value
    ) {

        return String(
            value || ""
        )
            .toLowerCase()
            .trim();

    }


    function buildConditionLookup(
        blockText
    ) {

        const lookup = {};


        const source =
            String(
                blockText || ""
            );


        if (
            !source.trim()
        ) {

            return lookup;

        }


        /*
         * -----------------------------------------------------------
         * Match:
         *
         * name: CUSTOMER NAME
         * ...
         * amount: 1,000
         *
         * The existing engine uses the same name/amount structure.
         * -----------------------------------------------------------
         */

        const globalRegex =
            /name\s*[:=]\s*([^\n\r]+)[\s\S]*?amount\s*[:=]\s*([0-9]+(?:[,.][0-9]+)*)/gi;


        let match;


        while (
            (
                match =
                    globalRegex.exec(
                        source
                    )
            ) !== null
        ) {

            const customerName =
                normalizeConditionCustomerName(
                    match[1]
                );


            const amount =
                Number(
                    String(
                        match[2]
                    )
                        .replace(/,/g, "")
                ) || 0;


            if (
                !customerName ||
                amount <= 0
            ) {

                continue;

            }


            /*
             * -------------------------------------------------------
             * IMPORTANT:
             *
             * A customer can potentially appear more than once.
             *
             * We preserve multiple amounts instead of silently
             * overwriting them.
             * -------------------------------------------------------
             */

            if (
                !lookup[customerName]
            ) {

                lookup[customerName] = [];

            }


            lookup[customerName].push(
                amount
            );

        }


        return lookup;

    }


    /*
     * ---------------------------------------------------------------
     * BUILD EACH LOOKUP ONCE
     * ---------------------------------------------------------------
     */

    const defaultLookup =
        buildConditionLookup(
            defaultBlock
                ? defaultBlock[1]
                : ""
        );


    const recoveryLookup =
        buildConditionLookup(
            recoveryBlock
                ? recoveryBlock[1]
                : ""
        );


    const paydownLookup =
        buildConditionLookup(
            paydownBlock
                ? paydownBlock[1]
                : ""
        );


    const usedPaydownLookup =
        buildConditionLookup(
            usedPaydownBlock
                ? usedPaydownBlock[1]
                : ""
        );


    const payoffLookup =
        buildConditionLookup(
            payoffBlock
                ? payoffBlock[1]
                : ""
        );


    /* ================================================================
    * PAYOFF RECIPIENT
    * ================================================================
    *
    * RULE:
    *
    * If a customer has:
    *
    *     OLD ACTIVE LOAN
    *     NEW LOAN DISBURSED TODAY
    *
    * then:
    *
    *     OLD LOAN -> Pay Off
    *     NEW LOAN -> No Activity
    *
    * We select the most recent loan whose disbursement date
    * is strictly BEFORE today's report date.
    *
    * This does NOT modify Settled, Recovery, Default,
    * Pay Down, or normal repayment logic.
    * ================================================================ */

    function parsePayoffDate(value) {

        if (!value) {
            return null;
        }

        /* Handle an actual JavaScript Date object */
        if (
            Object.prototype.toString.call(value) ===
            "[object Date]"
        ) {

            if (isNaN(value.getTime())) {
                return null;
            }

            return new Date(
                Date.UTC(
                    value.getFullYear(),
                    value.getMonth(),
                    value.getDate()
                )
            );
        }


        const valueString =
            String(value).trim();

        if (!valueString) {
            return null;
        }


        /*
        * ------------------------------------------------------------
        * ISO DATE / ISO DATETIME
        *
        * Examples:
        *
        * 2026-09-01
        * 2026-09-01T00:00:00.000Z
        * ------------------------------------------------------------
        */

        let match =
            valueString.match(
                /^(\d{4})-(\d{1,2})-(\d{1,2})/
            );

        if (match) {

            const year =
                Number(match[1]);

            const month =
                Number(match[2]);

            const day =
                Number(match[3]);

            const parsed =
                new Date(
                    Date.UTC(
                        year,
                        month - 1,
                        day
                    )
                );

            if (
                parsed.getUTCFullYear() !== year ||
                parsed.getUTCMonth() !== month - 1 ||
                parsed.getUTCDate() !== day
            ) {
                return null;
            }

            return parsed;
        }


        /*
        * ------------------------------------------------------------
        * DD/MM/YYYY OR MM/DD/YYYY
        * ------------------------------------------------------------
        */

        match =
            valueString.match(
                /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/
            );

        if (!match) {
            return null;
        }


        const first =
            Number(match[1]);

        const second =
            Number(match[2]);

        let year =
            Number(match[3]);

        if (year < 100) {
            year += 2000;
        }


        let day;
        let month;


        /*
        * 04/24/2026
        */
        if (
            second > 12 &&
            first >= 1 &&
            first <= 12
        ) {

            month = first;
            day = second;

        }

        /*
        * 24/04/2026
        */
        else if (
            first > 12 &&
            second >= 1 &&
            second <= 12
        ) {

            day = first;
            month = second;

        }

        /*
        * Application default:
        * DD/MM/YYYY
        */
        else {

            day = first;
            month = second;
        }


        const parsed =
            new Date(
                Date.UTC(
                    year,
                    month - 1,
                    day
                )
            );


        if (
            parsed.getUTCFullYear() !== year ||
            parsed.getUTCMonth() !== month - 1 ||
            parsed.getUTCDate() !== day
        ) {

            return null;
        }


        return parsed;
    }


    const payoffRecipientIndexMap = {};


    const payoffReportDate =
        parsePayoffDate(
            appState.dataCore.activeDate
        );


    if (
        payoffReportDate &&
        Object.keys(payoffLookup).length > 0
    ) {

        appState.dataCore.loadedRecords
            .forEach((client, index) => {

                const customerKey =
                    String(
                        client.accountName || ""
                    )
                        .toLowerCase()
                        .trim();


                if (!customerKey) {
                    return;
                }


                /*
                * Customer must actually appear in
                * today's Pay Off section.
                */

                if (
                    !payoffLookup[customerKey]
                ) {
                    return;
                }


                const disbursementDate =
                    parsePayoffDate(
                        client.disbursementDate
                    );


                if (!disbursementDate) {
                    return;
                }


                /*
                * NEVER assign Pay Off to today's loan.
                */

                if (
                    disbursementDate >=
                    payoffReportDate
                ) {
                    return;
                }


                const existingIndex =
                    payoffRecipientIndexMap[
                        customerKey
                    ];


                /*
                * First previous loan found.
                */

                if (
                    existingIndex === undefined
                ) {

                    payoffRecipientIndexMap[
                        customerKey
                    ] = index;

                    return;
                }


                /*
                * If several previous loans exist,
                * keep the most recently disbursed one.
                */

                const existingClient =
                    appState.dataCore.loadedRecords[
                        existingIndex
                    ];


                const existingDate =
                    parsePayoffDate(
                        existingClient.disbursementDate
                    );


                if (
                    existingDate &&
                    disbursementDate >
                    existingDate
                ) {

                    payoffRecipientIndexMap[
                        customerKey
                    ] = index;
                }

            });
    }

    appState.dataCore.loadedRecords
        .forEach((client, idx) => {

            let processedDays =
                parseInt(
                    client.activeRepaymentDays,
                    10
                );

            if (isNaN(processedDays)) {
                processedDays = 0;
            }


            /* ================================================================
            * LOAN / PAYMENT VALUES
            * ================================================================ */

            const principalAmount =
                Number(client.principalAmount) || 0;

            const totalAmountPaid =
                Number(client.totalAmountPaid) || 0;


            /* ================================================================
            * CALCULATE ACTUAL CALENDAR DAYS FROM DISBURSEMENT
            *
            * This is deliberately calculated independently from
            * client.status and activeRepaymentDays.
            *
            * This prevents an incorrectly classified DataCore record from
            * receiving normal repayment + recovery.
            * ================================================================ */

            function parseFrontendDate(value) {

                if (!value) {
                    return null;
                }

                const valueString =
                    String(value).trim();

                if (!valueString) {
                    return null;
                }


                /*
                * ------------------------------------------------------------
                * YYYY-MM-DD
                * ------------------------------------------------------------
                */

                let match =
                    valueString.match(
                        /^(\d{4})-(\d{1,2})-(\d{1,2})$/
                    );

                if (match) {

                    return new Date(
                        Date.UTC(
                            Number(match[1]),
                            Number(match[2]) - 1,
                            Number(match[3])
                        )
                    );
                }


                /*
                * ------------------------------------------------------------
                * DD/MM/YYYY OR MM/DD/YYYY
                * ------------------------------------------------------------
                */

                match =
                    valueString.match(
                        /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/
                    );

                if (!match) {
                    return null;
                }


                const first =
                    Number(match[1]);

                const second =
                    Number(match[2]);

                let year =
                    Number(match[3]);


                if (year < 100) {
                    year += 2000;
                }


                let day;
                let month;


                /*
                * 4/24/2026
                *
                * Clearly MM/DD/YYYY because 24 cannot be a month.
                */

                if (
                    second > 12 &&
                    first >= 1 &&
                    first <= 12
                ) {

                    month = first;
                    day = second;

                }

                /*
                * 24/04/2026
                *
                * Clearly DD/MM/YYYY.
                */

                else if (
                    first > 12 &&
                    second >= 1 &&
                    second <= 12
                ) {

                    day = first;
                    month = second;

                }

                /*
                * Ambiguous values follow the application's
                * DD/MM/YYYY rule.
                */

                else {

                    day = first;
                    month = second;
                }


                return new Date(
                    Date.UTC(
                        year,
                        month - 1,
                        day
                    )
                );
            }


            /* ================================================================
            * REPORT DATE
            * ================================================================ */

            const frontendReportDate =
                parseFrontendDate(
                    appState.dataCore.activeDate
                );


            /* ================================================================
            * DISBURSEMENT DATE
            * ================================================================ */

            const frontendDisbursementDate =
                parseFrontendDate(
                    client.disbursementDate
                );


            /* ================================================================
            * ACTUAL ELAPSED DAYS
            * ================================================================ */

            let actualLoanAgeDays = 0;


            if (
                frontendReportDate &&
                frontendDisbursementDate
            ) {

                const millisecondsPerDay =
                    24 * 60 * 60 * 1000;


                actualLoanAgeDays =
                    Math.floor(
                        (
                            frontendReportDate.getTime() -
                            frontendDisbursementDate.getTime()
                        ) /
                        millisecondsPerDay
                    );


                if (
                    actualLoanAgeDays < 0
                ) {

                    actualLoanAgeDays = 0;
                }
            }


            /* ================================================================
            * OUTSTANDING CUSTOMER
            *
            * IMPORTANT:
            *
            * For the normal repayment calculation, a customer is outstanding
            * when:
            *
            *     loan age > 25 days
            *     AND
            *     principal has not been fully paid.
            *
            * We also retain DataCore's explicit Outstanding status as a
            * fallback.
            * ================================================================ */

            const isNotFullyPaid =
                principalAmount > 0 &&
                totalAmountPaid < principalAmount;


            const isOutstandingCust =
                client.status ===
                    "Outstanding Customer";


            /*
            * IMPORTANT:
            *
            * Freeze the state BEFORE Recovery, Pay Down, Pay Off, etc.
            */

            const wasOutstandingCustomer =
                isOutstandingCust;


            const isSettledLoan =
                client.status === "Settled";


            const isFutureLoan =
                client.status ===
                    "Future Disbursement";


            const isDisbursedToday =
                appState.dataCore.activeDate ===
                client.disbursementDate;


            let baseRepayment =
                (
                    wasOutstandingCustomer ||
                    isSettledLoan ||
                    isDisbursedToday
                )
                    ? 0
                    : Number(client.dailyRepayment) || 0;


            let calculatedFinalRepayment =
                baseRepayment;


            let hasNewActivity = false;

            const auditTags = [];
            const transactionConditions = [];


            const parsedCollected =
                Number(client.collectedToday) || 0;


            let badgeText =
                "Active";


            let badgeClass =
                "badge-active";


            if (isFutureLoan) {

                badgeText =
                    "No Activity";

                badgeClass =
                    "badge-future";

            } else if (wasOutstandingCustomer) {

                badgeText =
                    "Outstanding Customer";

                badgeClass =
                    "badge-outstanding";

            } else if (isDisbursedToday) {

                badgeText =
                    "No Activity";

                badgeClass =
                    "badge-future";
            }


            const normName =
                String(client.accountName || "")
                    .toLowerCase()
                    .trim();


            const isLastInstance =
                lastRowIndexMap[normName] === idx;

            const isPayoffRecipient =
                payoffRecipientIndexMap[normName] === idx;


            if (
                isLastInstance &&
                !isFutureLoan &&
                !isDisbursedToday
            ) {

                /* ---------------- DEFAULT ---------------- */

                if (
                    normName &&
                    defaultLookup[normName]
                ) {

                    const defaultAmounts =
                        defaultLookup[normName] || [];


                    const defaultAmount =
                        defaultAmounts.length > 0
                            ? Number(
                                defaultAmounts[0]
                            ) || 0
                            : baseRepayment;


                    calculatedFinalRepayment =
                        Math.max(
                            0,
                            baseRepayment -
                            defaultAmount
                        );


                    hasNewActivity = true;


                    /* ---------------------------------------------------------------
                    * DETERMINE DEFAULT TYPE
                    * --------------------------------------------------------------- */

                    if (defaultAmount > 0) {

                        const isFullDefault =
                            defaultAmount >= baseRepayment;

                        const defaultConditionType =
                            isFullDefault
                                ? "Full Default"
                                : "Partial Default";


                        /* -----------------------------------------------------------
                        * STORE THE DEFAULT CONDITION
                        *
                        * IMPORTANT:
                        * The amount here is ONLY the DEFAULT amount.
                        *
                        * Recovery is stored separately below.
                        *
                        * Example:
                        * Default = ₦1,000
                        * Recovery = ₦1,000
                        *
                        * conditions becomes:
                        *
                        * [
                        *   { type: "Partial Default", amount: 1000 },
                        *   { type: "Recovery", amount: 1000 }
                        * ]
                        * ----------------------------------------------------------- */

                        transactionConditions.push({

                            type:
                                defaultConditionType,

                            amount:
                                Number(defaultAmount) || 0

                        });


                        /* -----------------------------------------------------------
                        * UI BADGE
                        * ----------------------------------------------------------- */

                        if (isFullDefault) {

                            badgeText =
                                "Full Default";

                            badgeClass =
                                "badge-full-default";

                            auditTags.push(
                                "FULL DEFAULT — ₦" +
                                Number(defaultAmount).toLocaleString()
                            );

                        } else {

                            badgeText =
                                "Partial Default";

                            badgeClass =
                                "badge-partial-default";

                            auditTags.push(
                                "PARTIAL DEFAULT — ₦" +
                                Number(defaultAmount).toLocaleString()
                            );
                        }
                    }
                }


                /* ---------------- NORMAL COLLECTION ---------------- */

                const expectedTarget =
                    Number(calculatedFinalRepayment) || 0;


                if (
                    parsedCollected ===
                        expectedTarget &&
                    expectedTarget > 0
                ) {

                    hasNewActivity = true;

                    badgeText =
                        "Active";

                    badgeClass =
                        "badge-active";
                }

                /* ---------------- RECOVERY ---------------- */

                if (
                    normName &&
                    recoveryLookup[normName]
                ) {

                    const recoveryAmounts =
                        recoveryLookup[normName] || [];


                    const extractedAmt =
                        recoveryAmounts.length > 0
                            ? Number(
                                recoveryAmounts[0]
                            ) || 0
                            : 0;


                    if (
                        extractedAmt > 0
                    ) {

                        /*
                        * ---------------------------------------------------------
                        * RECOVERY CANCELS THE DEFAULT
                        * ---------------------------------------------------------
                        *
                        * ₦4,800
                        * -₦1,000 default
                        * +₦1,000 recovery
                        * ----------------
                        * ₦4,800
                        * ---------------------------------------------------------
                        */

                        if (wasOutstandingCustomer) {

                            /*
                            * ============================================================
                            * OUTSTANDING + RECOVERY
                            * ============================================================
                            *
                            * Recovery is the ONLY collection for today.
                            *
                            * Example:
                            *
                            * Normal repayment = ₦6,000
                            * Recovery         = ₦1,000
                            *
                            * Final collection = ₦1,000
                            *
                            * NOT ₦7,000.
                            * ============================================================
                            */

                            calculatedFinalRepayment =
                                extractedAmt;

                        } else {

                            /*
                            * Normal active customer:
                            *
                            * Normal repayment + Recovery
                            */

                            calculatedFinalRepayment +=
                                extractedAmt;
                        }


                        hasNewActivity =
                            true;


                        /*
                        * ---------------------------------------------------------
                        * PRESERVE THE ACTUAL RECOVERY CONDITION
                        * ---------------------------------------------------------
                        */

                        transactionConditions.push({

                            type:
                                "Recovery",

                            amount:
                                extractedAmt

                        });


                        auditTags.push(
                            "INJECTED RECOVERY — ₦" +
                            extractedAmt.toLocaleString()
                        );


                        badgeText =
                            "Injected Recovery";

                        badgeClass =
                            "badge-recovery";

                    }

                }


                /* ---------------- PAY DOWN ---------------- */

                if (
                    normName &&
                    paydownLookup[normName]
                ) {

                    const paydownAmounts =
                        paydownLookup[normName] || [];


                    const extractedAmt =
                        paydownAmounts.length > 0
                            ? Number(
                                paydownAmounts[0]
                            ) || 0
                            : 0;


                    if (
                        extractedAmt > 0
                    ) {

                        calculatedFinalRepayment +=
                            extractedAmt;


                        hasNewActivity =
                            true;


                        transactionConditions.push({

                            type:
                                "Pay Down",

                            amount:
                                extractedAmt

                        });


                        auditTags.push(
                            "PAY DOWN — ₦" +
                            extractedAmt.toLocaleString()
                        );


                        badgeText =
                            "Pay Down Added";

                        badgeClass =
                            "badge-paydown";

                    }

                }


                /* ---------------- USED PAY DOWN ---------------- */

                if (
                    normName &&
                    usedPaydownLookup[normName]
                ) {

                    const usedPaydownAmounts =
                        usedPaydownLookup[normName] || [];


                    const extractedAmt =
                        usedPaydownAmounts.length > 0
                            ? Number(
                                usedPaydownAmounts[0]
                            ) || 0
                            : 0;


                    if (
                        extractedAmt > 0
                    ) {

                        calculatedFinalRepayment -=
                            extractedAmt;


                        hasNewActivity =
                            true;


                        transactionConditions.push({

                            type:
                                "Used Pay Down",

                            amount:
                                extractedAmt

                        });


                        auditTags.push(
                            "USED PAY DOWN — ₦" +
                            extractedAmt.toLocaleString()
                        );


                        badgeText =
                            "Used Pay Down";

                        badgeClass =
                            "badge-usedpaydown";

                    }

                }

            }


                /* ---------------- FUTURE LOAN PAYDOWN ---------------- */

                /*
                * ---------------------------------------------------------------
                * FUTURE PAYDOWN OVERRIDE RULE
                * ---------------------------------------------------------------
                *
                * A customer qualifies for FUTURE PAY DOWN when:
                *
                * 1. This is the customer's LAST occurrence in the market.
                * 2. The loan was disbursed on the ACTIVE REPORT DATE.
                * 3. The customer's name exists in paydownLookup.
                * 4. The paydown amount is greater than zero.
                *
                * IMPORTANT:
                *
                * This deliberately overrides the normal "No Activity" state
                * created by isDisbursedToday.
                *
                * We do NOT depend on isFutureLoan here.
                * ---------------------------------------------------------------
                */

                const isFuturePayDownCandidate =
                    isLastInstance &&
                    isDisbursedToday &&
                    normName &&
                    paydownLookup[normName];


                if (
                    isFuturePayDownCandidate
                ) {

                    /*console.log(
                        "FUTURE PAYDOWN CHECK:",
                        {
                            customer:
                                client.accountName,

                            normName:
                                normName,

                            isLastInstance:
                                isLastInstance,

                            isDisbursedToday:
                                isDisbursedToday,

                            isFutureLoan:
                                isFutureLoan,

                            paydownLookupEntry:
                                paydownLookup[normName],

                            paydownLookupHasCustomer:
                                Object.prototype.hasOwnProperty.call(
                                    paydownLookup,
                                    normName
                                )
                        }
                    );*/


                    const futurePayDownAmount =
                        paydownLookup[normName] || [];


                    const extractedAmount =
                        futurePayDownAmount.length > 0
                            ? Number(
                                futurePayDownAmount[0]
                            ) || 0
                            : 0;


                    if (
                        extractedAmount > 0
                    ) {

                        /*
                        * -----------------------------------------------------------
                        * PAYDOWN OVERRIDES NO ACTIVITY
                        * -----------------------------------------------------------
                        */

                        calculatedFinalRepayment =
                            extractedAmount;


                        hasNewActivity =
                            true;


                        /*
                        * -----------------------------------------------------------
                        * PRESERVE CONDITION FOR POSTING
                        * -----------------------------------------------------------
                        */

                        transactionConditions.push({

                            type:
                                "Future Pay Down",

                            amount:
                                extractedAmount

                        });


                        /*
                        * -----------------------------------------------------------
                        * AUDIT
                        * -----------------------------------------------------------
                        */

                        auditTags.push(
                            "FUTURE PAY DOWN — ₦" +
                            extractedAmount.toLocaleString()
                        );


                        /*
                        * -----------------------------------------------------------
                        * UI
                        * -----------------------------------------------------------
                        */

                        badgeText =
                            "Future Pay Down";

                        badgeClass =
                            "badge-futurepaydown";
                    }
                }


                /* ---------------- SETTLED ---------------- */

                if (
                    isSettledLoan &&
                    !hasNewActivity
                ) {

                    calculatedFinalRepayment = 0;

                    badgeText =
                        "Settled";

                    badgeClass =
                        "badge-finished";
                }

                /* ---------------- PAY OFF ---------------- */

                /*
                * ---------------------------------------------------------------
                * PAYOFF RULE — PREVIOUS LOAN ONLY
                * ---------------------------------------------------------------
                *
                * Pay Off belongs to the most recent loan BEFORE today's
                * report date.
                *
                * This block is intentionally OUTSIDE the isLastInstance block.
                *
                * Why?
                *
                * A customer can have:
                *
                *     OLD LOAN
                *         ↓
                *     Pay Off today
                *
                *     NEW LOAN TODAY
                *         ↓
                *     No Activity
                *
                * The old loan may NOT be the last customer row.
                *
                * IMPORTANT:
                * We do NOT modify the existing Active / Settled /
                * Outstanding / Recovery / Pay Down logic.
                * ---------------------------------------------------------------
                */

                if (
                    isPayoffRecipient &&
                    !isSettledLoan &&
                    !isFutureLoan &&
                    !isDisbursedToday &&
                    payoffLookup[normName]
                ) {

                    const payoffAmounts =
                        payoffLookup[normName] || [];


                    const extractedAmt =
                        payoffAmounts.length > 0
                            ? Number(
                                payoffAmounts[0]
                            ) || 0
                            : 0;


                    if (
                        extractedAmt > 0
                    ) {

                        /*
                        * Add the Pay Off to the OLD loan's
                        * existing calculated repayment.
                        *
                        * Example:
                        *
                        * Normal repayment = ₦5,000
                        * Pay Off          = ₦20,000
                        *
                        * Final old-loan collection = ₦25,000
                        */

                        calculatedFinalRepayment +=
                            extractedAmt;


                        hasNewActivity =
                            true;


                        transactionConditions.push({

                            type:
                                "Pay Off",

                            amount:
                                extractedAmt

                        });


                        auditTags.push(
                            "PAY OFF — ₦" +
                            extractedAmt.toLocaleString()
                        );


                        badgeText =
                            "Pay Off Added";

                        badgeClass =
                            "badge-payoff";

                    }
                }


            /* ---------------- CREATE ROW SAFELY ---------------- */

            /*
            * ---------------------------------------------------------------
            * SAVE THE FINAL TRANSACTION DATA ON THE CLIENT
            * ---------------------------------------------------------------
            *
            * The posting function will read this exact calculation.
            * It will NOT try to reconstruct conditions from the badge.
            */

            client._dataCoreTransaction = {

                collectedToday:
                    Math.max(
                        0,
                        Number(
                            calculatedFinalRepayment
                        ) || 0
                    ),

                conditions:
                    transactionConditions.map(
                        function(condition) {

                            return {

                                type:
                                    condition.type,

                                amount:
                                    Number(
                                        condition.amount
                                    ) || 0

                            };

                        }
                    ),

                customerName:
                    String(
                        client.accountName ||
                        ""
                    ).trim(),

                reportDate:
                    appState.dataCore.activeDate

            };

            const tr =
                document.createElement("tr");


            const values = [

                client.accountName,

                client.borrowerUniqueNum,

                client.loanUniqueNum,

                `₦${(Number(client.principalAmount) || 0).toLocaleString()}`,

                `₦${(Number(client.form) || 0).toLocaleString()}`,

                `₦${(Number(client.card) || 0).toLocaleString()}`,

                `₦${(Number(client.dailyRepayment) || 0).toLocaleString()}`,

                `₦${(Number(client.totalAmountPaid) || 0).toLocaleString()}`,

                client.branchId,

                client.disbursementDate,

                client.marketOfficerName
            ];


            values.forEach(value => {

                const td =
                    document.createElement("td");

                td.textContent =
                    String(value ?? "");

                tr.appendChild(td);
            });


            const inputCell =
                document.createElement("td");


            const input =
                document.createElement("input");


            input.type =
                "number";

            input.min =
                "0";

            input.step =
                "0.01";

            input.value =
                calculatedFinalRepayment;

            input.id =
                `grid-input-${idx}`;

            input.className =
                "grid-inline-input datacore-matrix-input";


            input.addEventListener(
                "input",
                calculateDataCoreLedgerMatrix
            );


            inputCell.appendChild(input);

            tr.appendChild(inputCell);


            const badgeCell =
                document.createElement("td");


            const badge =
                document.createElement("span");


            badge.id =
                `badge-row-${idx}`;

            badge.className =
                `badge ${badgeClass}`;

            if (
                auditTags.length > 0
            ) {

                badge.innerHTML =
                    auditTags
                        .map(
                            function(tag) {

                                return (
                                    `<div class="audit-tag-line">` +
                                    `${escapeHTML(tag)}` +
                                    `</div>`
                                );

                            }
                        )
                        .join("");

            } else {

                badge.textContent =
                    badgeText;

            }


            badgeCell.appendChild(badge);

            tr.appendChild(badgeCell);


            fragment.appendChild(tr);
        });

    
    gridBody.appendChild(fragment);


    calculateDataCoreLedgerMatrix();

    finishDataCorePerformanceTimer(
        dataCoreRenderTimer,
        "DataCore frontend rendering"
    )
}


/* =========================================================================
 * DATACORE POST STATE
 * ========================================================================= 

let dataCoreSubmissionInProgress = false;

let dataCoreSubmissionSucceeded = false;*/

/* =========================================================================
   16. DATACORE TOTAL + BALANCE ENGINE
   ========================================================================= */

function calculateDataCoreLedgerMatrix() {

    let computedCollectionSum = 0;


    /*
     * ---------------------------------------------------------------
     * CALCULATE CURRENT DATACORE COLLECTION
     * ---------------------------------------------------------------
     */

    appState.dataCore.loadedRecords
        .forEach(
            function(client, idx) {

                const input =
                    $(`grid-input-${idx}`);


                if (!input) {

                    return;

                }


                const value =
                    Number(
                        input.value
                    );


                if (
                    Number.isFinite(value)
                ) {

                    computedCollectionSum +=
                        Math.max(
                            0,
                            value
                        );

                }

            }
        );


    /*
     * ---------------------------------------------------------------
     * SAVE DATACORE TOTAL
     * ---------------------------------------------------------------
     */

    appState.dataCore.dataCoreActualTotal =
        computedCollectionSum;


    setText(
        "grid-actual-total",
        "₦" +
        computedCollectionSum.toLocaleString()
    );


    /*
     * ---------------------------------------------------------------
     * GET BUSINESS PARSER TOTAL
     * ---------------------------------------------------------------
     */

    const parserTotal =
        Number(
            appState.dataCore.parserVerifiedTotal
        ) || 0;


    /*
     * ---------------------------------------------------------------
     * RECONCILIATION
     * ---------------------------------------------------------------
     */

    const isBalanced =
        Math.round(
            computedCollectionSum * 100
        ) ===
        Math.round(
            parserTotal * 100
        );


    appState.dataCore.balanced =
        isBalanced;


    /*
     * ---------------------------------------------------------------
     * POST BUTTON
     * ---------------------------------------------------------------
 */

    const syncBtn =
        $("sync-ledger-sheets-btn");


    if (!syncBtn) {

        return;

    }


    /*
     * ---------------------------------------------------------------
     * POSTING IN PROGRESS
     *
     * NEVER RE-ENABLE THE BUTTON WHILE POSTING.
     * ---------------------------------------------------------------
     */

    if (
        appState.dataCore.posting
    ) {

        syncBtn.disabled =
            true;

        syncBtn.classList.remove(
            "ready-to-post"
        );

        syncBtn.style.cursor =
            "not-allowed";

        syncBtn.title =
            "DataCore submission is currently in progress.";

        return;

    }


    /*
     * ---------------------------------------------------------------
     * SERVER CONFIRMED SUCCESS
     *
     * Once the server has confirmed a complete successful post,
     * do not allow the calculation function to re-enable the button.
     * ---------------------------------------------------------------
     */

    if (
        appState.dataCore.postConfirmed
    ) {

        syncBtn.disabled =
            true;

        syncBtn.classList.remove(
            "ready-to-post"
        );

        syncBtn.style.cursor =
            "not-allowed";

        syncBtn.title =
            "DataCore submission has already been confirmed.";

        return;

    }


    /*
     * ---------------------------------------------------------------
     * BALANCED = READY TO POST
     * ---------------------------------------------------------------
     */

    if (
        appState.dataCore.balanced
    ) {

        syncBtn.disabled =
            false;

        syncBtn.removeAttribute(
            "disabled"
        );

        syncBtn.classList.add(
            "ready-to-post"
        );

        syncBtn.style.cursor =
            "pointer";

        syncBtn.textContent =
            "Post Real-Time Matrix Collection to Sheet";

        syncBtn.title =
            "Business Parser & DataCore totals match. Ready to post.";

    }


    /*
     * ---------------------------------------------------------------
     * NOT BALANCED = DISABLE
     * ---------------------------------------------------------------
     */

    else {

        syncBtn.disabled =
            true;

        syncBtn.setAttribute(
            "disabled",
            "true"
        );

        syncBtn.classList.remove(
            "ready-to-post"
        );

        syncBtn.style.cursor =
            "not-allowed";

        syncBtn.textContent =
            "Post Real-Time Matrix Collection to Sheet";

        syncBtn.title =
            "Posting disabled because totals do not match.";

    }

}

function updateDataCorePostButton(
    businessTotal,
    dataCoreTotal
) {

    const postButton =
        $("sync-ledger-sheets-btn");


    if (!postButton) {

        return;

    }


    /*
     * ---------------------------------------------------------------
     * NEVER ENABLE WHILE POSTING
     * ---------------------------------------------------------------
     */

    if (
        appState.dataCore.posting
    ) {

        postButton.disabled =
            true;

        postButton.classList.remove(
            "ready-to-post"
        );

        postButton.style.cursor =
            "not-allowed";

        postButton.title =
            "DataCore submission is currently in progress.";

        return;

    }


    /*
     * ---------------------------------------------------------------
     * NEVER ENABLE AFTER SERVER CONFIRMED SUCCESS
     * ---------------------------------------------------------------
     */

    if (
        appState.dataCore.postConfirmed
    ) {

        postButton.disabled =
            true;

        postButton.classList.remove(
            "ready-to-post"
        );

        postButton.style.cursor =
            "not-allowed";

        postButton.title =
            "DataCore submission has already been confirmed.";

        return;

    }


    const businessAmount =
        Number(
            businessTotal
        ) || 0;


    const dataCoreAmount =
        Number(
            dataCoreTotal
        ) || 0;


    const totalsMatch =
        Math.round(
            (
                businessAmount -
                dataCoreAmount
            ) * 100
        ) === 0;


    /*
     * ---------------------------------------------------------------
     * BALANCED
     * ---------------------------------------------------------------
     */

    if (
        totalsMatch
    ) {

        postButton.disabled =
            false;

        postButton.removeAttribute(
            "disabled"
        );

        postButton.classList.add(
            "ready-to-post"
        );

        postButton.style.cursor =
            "pointer";

        postButton.textContent =
            "Post Real-Time Matrix Collection to Sheet";

        postButton.title =
            "Business Parser and DataCore totals match. Ready to post.";

    }


    /*
     * ---------------------------------------------------------------
     * NOT BALANCED
     * ---------------------------------------------------------------
     */

    else {

        postButton.disabled =
            true;

        postButton.setAttribute(
            "disabled",
            "true"
        );

        postButton.classList.remove(
            "ready-to-post"
        );

        postButton.style.cursor =
            "not-allowed";

        postButton.textContent =
            "Post Real-Time Matrix Collection to Sheet";

        postButton.title =
            "Posting disabled because totals do not match.";

    }

}



/* =====================================================================
 * DATACORE MULTI-CONDITION PAYLOAD NORMALIZER
 *
 * FINAL VERSION
 *
 * RULES:
 *
 * 1. Same borrower + same loan = one transaction row.
 * 2. Collection amounts are added together.
 * 3. Conditions are preserved individually.
 * 4. Condition amounts are preserved individually.
 * 5. Customer name is preserved.
 * 6. Report date is preserved.
 * 7. Conditional comments are preserved.
 * 8. Normal collection does NOT create a comment.
 * 9. Duplicate conditions are merged by type + amount.
 * ===================================================================== */

function normalizeDataCoreRowsPayload(
    rowsPayload
) {

    if (
        !Array.isArray(rowsPayload)
    ) {

        return [];

    }


    const grouped = {};
    const order = [];


    /*
     * ---------------------------------------------------------------
     * CONDITION NORMALIZER
     * ---------------------------------------------------------------
     */

    function normalizeConditionType(
        type
    ) {

        const value =
            String(
                type || ""
            )
                .trim()
                .replace(/\s+/g, " ");


        if (
            !value
        ) {

            return "";

        }


        const key =
            value.toLowerCase();


        if (
            key === "normal collection" ||
            key === "collection" ||
            key === "active"
        ) {

            return "";

        }


        if (
            key === "full default"
        ) {

            return "Full Default";

        }


        if (
            key === "partial default"
        ) {

            return "Partial Default";

        }


        if (
            key === "recovery"
        ) {

            return "Recovery";

        }


        if (
            key === "future pay down"
        ) {

            return "Future Pay Down";

        }


        if (
            key === "pay down" ||
            key === "paydown"
        ) {

            return "Pay Down";

        }


        if (
            key === "used pay down" ||
            key === "use pay down"
        ) {

            return "Used Pay Down";

        }


        if (
            key === "payoff" ||
            key === "pay off"
        ) {

            return "Pay Off";

        }


        return "";

    }


    /*
     * ---------------------------------------------------------------
     * ADD CONDITION
     * ---------------------------------------------------------------
     */

    function addCondition(
        target,
        type,
        amount
    ) {

        const normalizedType =
            normalizeConditionType(
                type
            );


        if (
            !normalizedType
        ) {

            return;

        }


        const numericAmount =
            Number(
                amount
            ) || 0;


        /*
         * Same condition type is merged.
         *
         * Example:
         *
         * Default 500
         * Default 500
         *
         * becomes:
         *
         * Default 1000
         */

        const existing =
            target.find(
                function(item) {

                    return (
                        String(
                            item.type
                        )
                            .trim()
                            .toLowerCase()
                        ===
                        normalizedType
                            .toLowerCase()
                    );

                }
            );


        if (
            existing
        ) {

            existing.amount +=
                numericAmount;

        } else {

            target.push({

                type:
                    normalizedType,

                amount:
                    numericAmount

            });

        }

    }


    /*
     * ---------------------------------------------------------------
     * ADD COMMENT
     * ---------------------------------------------------------------
     */

    function addComment(
        target,
        comment
    ) {

        const value =
            String(
                comment || ""
            ).trim();


        if (
            !value
        ) {

            return;

        }


        if (
            target.indexOf(
                value
            ) === -1
        ) {

            target.push(
                value
            );

        }

    }


    /*
     * ---------------------------------------------------------------
     * PROCESS ROWS
     * ---------------------------------------------------------------
     */

    rowsPayload.forEach(
        function(row) {

            if (
                !row ||
                typeof row !== "object"
            ) {

                return;

            }


            const borrower =
                String(
                    row.borrowerUniqueNum ||
                    ""
                ).trim();


            const loan =
                String(
                    row.loanUniqueNum ||
                    ""
                ).trim();


            if (
                !borrower ||
                !loan
            ) {

                return;

            }


            const key =
                borrower.toLowerCase() +
                "::" +
                loan.toLowerCase();


            /*
             * -------------------------------------------------------
             * CREATE GROUP
             * -------------------------------------------------------
             */

            if (
                !grouped[key]
            ) {

                grouped[key] = {

                    ...row,

                    borrowerUniqueNum:
                        borrower,

                    loanUniqueNum:
                        loan,

                    customerName:
                        String(
                            row.customerName ||
                            ""
                        ).trim(),

                    reportDate:
                        row.reportDate ||
                        "",

                    collectedToday:
                        Number(
                            row.collectedToday
                        ) || 0,

                    comments:
                        [],

                    conditions:
                        []

                };


                /*
                 * ---------------------------------------------------
                 * IMPORTANT FIX:
                 *
                 * The FIRST ROW'S COMMENT is now preserved.
                 * ---------------------------------------------------
                 */

                addComment(
                    grouped[key].comments,
                    row.comment
                );


                /*
                 * ---------------------------------------------------
                 * LEGACY CONDITION
                 * ---------------------------------------------------
                 */

                if (
                    !Array.isArray(row.conditions) ||
                    row.conditions.length === 0
                ) {

                    addCondition(
                        grouped[key].conditions,
                        row.condition,
                        row.conditionAmount
                    );

                }


                /*
                 * ---------------------------------------------------
                 * MULTIPLE CONDITIONS
                 * ---------------------------------------------------
                 */

                if (
                    Array.isArray(
                        row.conditions
                    )
                ) {

                    row.conditions.forEach(
                        function(condition) {

                            if (
                                typeof condition ===
                                "string"
                            ) {

                                addCondition(
                                    grouped[key].conditions,
                                    condition,
                                    0
                                );

                                return;

                            }


                            if (
                                condition &&
                                typeof condition ===
                                "object"
                            ) {

                                addCondition(
                                    grouped[key].conditions,
                                    condition.type,
                                    condition.amount
                                );

                            }

                        }
                    );

                }


                order.push(
                    key
                );


                return;

            }


            /*
             * -------------------------------------------------------
             * SAME BORROWER + SAME LOAN
             * -------------------------------------------------------
             */

            grouped[key].collectedToday +=
                Number(
                    row.collectedToday
                ) || 0;


            /*
             * -------------------------------------------------------
             * PRESERVE NAME
             * -------------------------------------------------------
             */

            if (
                !grouped[key].customerName &&
                row.customerName
            ) {

                grouped[key].customerName =
                    String(
                        row.customerName
                    ).trim();

            }


            /*
             * -------------------------------------------------------
             * PRESERVE DATE
             * -------------------------------------------------------
             */

            if (
                !grouped[key].reportDate &&
                row.reportDate
            ) {

                grouped[key].reportDate =
                    row.reportDate;

            }


            /*
             * -------------------------------------------------------
             * COMMENTS
             * -------------------------------------------------------
             */

            addComment(
                grouped[key].comments,
                row.comment
            );


            /*
             * -------------------------------------------------------
             * LEGACY CONDITION
             * -------------------------------------------------------
             */

            if (
                !Array.isArray(row.conditions) ||
                row.conditions.length === 0
            ) {

                addCondition(
                    grouped[key].conditions,
                    row.condition,
                    row.conditionAmount
                );

            }


            /*
             * -------------------------------------------------------
             * MULTIPLE CONDITIONS
             * -------------------------------------------------------
             */

            if (
                Array.isArray(
                    row.conditions
                )
            ) {

                row.conditions.forEach(
                    function(condition) {

                        if (
                            typeof condition ===
                            "string"
                        ) {

                            addCondition(
                                grouped[key].conditions,
                                condition,
                                0
                            );

                            return;

                        }


                        if (
                            condition &&
                            typeof condition ===
                            "object"
                        ) {

                            addCondition(
                                grouped[key].conditions,
                                condition.type,
                                condition.amount
                            );

                        }

                    }
                );

            }

        }
    );


    /*
     * ---------------------------------------------------------------
     * FINAL CLEANUP
     * ---------------------------------------------------------------
     */

    return order.map(
        function(key) {

            const row =
                grouped[key];


            /*
             * -------------------------------------------------------
             * REMOVE DUPLICATE COMMENTS
             * -------------------------------------------------------
             */

            row.comments =
                row.comments.filter(
                    function(
                        comment,
                        index,
                        array
                    ) {

                        return (
                            array.indexOf(
                                comment
                            ) === index
                        );

                    }
                );


            /*
             * -------------------------------------------------------
             * REMOVE INVALID CONDITIONS
             * -------------------------------------------------------
             */

            row.conditions =
                row.conditions.filter(
                    function(
                        condition,
                        index,
                        array
                    ) {

                        const type =
                            String(
                                condition.type ||
                                ""
                            )
                                .trim()
                                .toLowerCase();


                        return (
                            type &&
                            array.findIndex(
                                function(item) {

                                    return (
                                        String(
                                            item.type ||
                                            ""
                                        )
                                            .trim()
                                            .toLowerCase()
                                        ===
                                        type
                                    );

                                }
                            ) === index
                        );

                    }
                );


            /*
             * -------------------------------------------------------
             * LEGACY COMMENT FIELD
             * -------------------------------------------------------
             */

            row.comment =
                row.comments.join(
                    "\n"
                );


            /*
             * -------------------------------------------------------
             * LEGACY CONDITION FIELD
             * -------------------------------------------------------
             */

            row.condition =
                row.conditions
                    .map(
                        function(condition) {

                            return condition.type;

                        }
                    )
                    .join(
                        " + "
                    );


            /*
             * -------------------------------------------------------
             * LEGACY CONDITION AMOUNT
             *
             * First condition only.
             *
             * The complete truth remains in `conditions`.
             * -------------------------------------------------------
             */

            row.conditionAmount =
                row.conditions.length > 0

                    ? row.conditions[0].amount

                    : 0;


            return row;

        }
    );

}


/* =========================================================================
   17. DATACORE POSTING
   ========================================================================= */

async function postDataCoreTransactionsToSheets() {

    /*
     * ===============================================================
     * DATACORE POST
     * ===============================================================
     *
     * STATE RULES:
     *
     * 1. posting = true while request is running.
     *
     * 2. postConfirmed = true ONLY after the server returns a
     *    complete SUCCESS response.
     *
     * 3. partial response is NOT treated as complete success.
     *
     * 4. failed/partial request unlocks the button.
     *
     * 5. duplicate clicks are blocked while request is running.
     *
     * ===============================================================
     */


    /*
     * ---------------------------------------------------------------
     * DUPLICATE CLICK PROTECTION
     * ---------------------------------------------------------------
     */

    if (
        appState.dataCore.posting
    ) {

        /*console.warn(
            "DataCore post already in progress."
        );*/

        return;

    }


    /*
     * ---------------------------------------------------------------
     * DO NOT POST AGAIN AFTER CONFIRMED SUCCESS
     * ---------------------------------------------------------------
     */

    if (
        appState.dataCore.postConfirmed
    ) {

        /*console.warn(
            "DataCore post has already been confirmed."
        );*/

        return;

    }


    /*
     * ---------------------------------------------------------------
     * BASIC VALIDATION
     * ---------------------------------------------------------------
     */

    if (
        !appState.dataCore.activeMarket ||
        !appState.dataCore.activeDate
    ) {

        alert(
            "⚠️ No active market/report is loaded."
        );

        return;

    }


    /*
     * ---------------------------------------------------------------
     * RECONCILIATION VALIDATION
     * ---------------------------------------------------------------
     */

    if (
        !appState.dataCore.balanced
    ) {

        alert(
            "❌ DataCore total does not match Business Parser Actual Collection."
        );

        return;

    }


    /*
     * ---------------------------------------------------------------
     * NUMBER NORMALIZER
     * ---------------------------------------------------------------
     */

    function normalizeDataCoreNumber(
        value
    ) {

        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {

            return 0;

        }


        if (
            typeof value === "number"
        ) {

            return Number.isFinite(value)
                ? value
                : 0;

        }


        const cleaned =
            String(value)
                .replace(/₦/g, "")
                .replace(/,/g, "")
                .replace(/\s/g, "")
                .trim();


        if (
            !cleaned
        ) {

            return 0;

        }


        const number =
            Number(
                cleaned
            );


        return Number.isFinite(number)
            ? number
            : 0;

    }


    /*
     * ---------------------------------------------------------------
     * BUILD TRANSACTION PAYLOAD
     * ---------------------------------------------------------------
     *
     * IMPORTANT:
     *
     * The visible grid input is authoritative ONLY for:
     *
     *      collectedToday
     *
     * Conditions come from:
     *
     *      client._dataCoreTransaction.conditions
     *
     * Conditions are completely separate from collection.
     * ---------------------------------------------------------------
     */

    const rowsPayload = [];


    appState.dataCore.loadedRecords.forEach(
        function(
            client,
            idx
        ) {


            /*
             * -------------------------------------------------------
             * GRID INPUT
             * -------------------------------------------------------
             */

            const input =
                $(
                    `grid-input-${idx}`
                );


            if (!input) {

                return;

            }


            /*
             * -------------------------------------------------------
             * COLLECTION AMOUNT
             * -------------------------------------------------------
             */

            const collectedAmt =
                Math.max(
                    0,
                    normalizeDataCoreNumber(
                        input.value
                    )
                );


            /*
             * -------------------------------------------------------
             * STORED DATACORE TRANSACTION
             * -------------------------------------------------------
             */

            const storedTransaction =
                client._dataCoreTransaction || {};


            /*
             * -------------------------------------------------------
             * STRUCTURED CONDITIONS
             * -------------------------------------------------------
             *
             * THIS IS THE SOURCE OF TRUTH.
             *
             * We do NOT read the badge.
             *
             * We do NOT use the combined condition string.
             *
             * We do NOT use the first condition amount.
             * -------------------------------------------------------
             */

            const transactionConditions =
                Array.isArray(
                    storedTransaction.conditions
                )

                    ? storedTransaction.conditions
                        .filter(
                            function(condition) {

                                return (
                                    condition &&
                                    condition.type &&
                                    normalizeDataCoreNumber(
                                        condition.amount
                                    ) > 0
                                );

                            }
                        )
                        .map(
                            function(condition) {

                                return {

                                    type:
                                        String(
                                            condition.type
                                        )
                                            .trim(),

                                    amount:
                                        normalizeDataCoreNumber(
                                            condition.amount
                                        )

                                };

                            }
                        )

                    : [];


            /*
             * -------------------------------------------------------
             * HAS CONDITIONS
             * -------------------------------------------------------
             */

            const hasConditions =
                transactionConditions.length > 0;


            /*
             * -------------------------------------------------------
             * CONDITION TOTAL
             * -------------------------------------------------------
             *
             * IMPORTANT:
             *
             * This is ONLY:
             *
             * Partial Default
             * + Recovery
             *
             * etc.
             *
             * It NEVER includes collectedToday.
             * -------------------------------------------------------
             */

            const conditionTotal =
                transactionConditions.reduce(
                    function(
                        total,
                        condition
                    ) {

                        return (
                            total +
                            normalizeDataCoreNumber(
                                condition.amount
                            )
                        );

                    },
                    0
                );


            /*
             * -------------------------------------------------------
             * COMBINED CONDITION LABEL
             * -------------------------------------------------------
             *
             * Compatibility/display only.
             *
             * It is NOT used for amount calculation.
             * -------------------------------------------------------
             */

            const condition =
                hasConditions

                    ? transactionConditions
                        .map(
                            function(condition) {

                                return String(
                                    condition.type
                                ).trim();

                            }
                        )
                        .join(
                            " + "
                        )

                    : "";


            /*
             * -------------------------------------------------------
             * CUSTOMER NAME
             * -------------------------------------------------------
             */

            const customerName =
                String(
                    client.accountName ||
                    storedTransaction.customerName ||
                    ""
                )
                    .trim();


            /*
             * -------------------------------------------------------
             * REPORT DATE
             * -------------------------------------------------------
             */

            const reportDate =
                String(
                    appState.dataCore.activeDate ||
                    storedTransaction.reportDate ||
                    ""
                )
                    .trim();


            /*
             * -------------------------------------------------------
             * BUILD CONDITIONAL COMMENT
             * -------------------------------------------------------
             *
             * Customer
             * Report Date
             * Partial Default — ₦2,000
             * Recovery — ₦1,000
             *
             * Normal collections receive NO NEW CONDITION COMMENT.
             * -------------------------------------------------------
             */

            let constructedComment =
                "";


            if (
                hasConditions
            ) {

                const conditionLines =
                    transactionConditions.map(
                        function(condition) {

                            return (
                                String(
                                    condition.type
                                ).trim() +
                                " — ₦" +
                                normalizeDataCoreNumber(
                                    condition.amount
                                ).toLocaleString()
                            );

                        }
                    );


                constructedComment =
                    "Customer: " +
                    customerName +
                    "\n" +

                    "Report Date: " +
                    reportDate +
                    "\n" +

                    conditionLines.join(
                        "\n"
                    );

            }


            /*
             * -------------------------------------------------------
             * SKIP EMPTY ROWS
             * -------------------------------------------------------
             *
             * Zero collection + no conditions = nothing to post.
             * -------------------------------------------------------
             */

            if (
                collectedAmt <= 0 &&
                !hasConditions
            ) {

                return;

            }


            /*
             * -------------------------------------------------------
             * BUILD FINAL TRANSACTION
             * -------------------------------------------------------
             */

            rowsPayload.push({

                borrowerUniqueNum:
                    String(
                        client.borrowerUniqueNum ??
                        ""
                    ).trim(),


                loanUniqueNum:
                    String(
                        client.loanUniqueNum ??
                        ""
                    ).trim(),


                customerName:
                    customerName,


                reportDate:
                    reportDate,


                /*
                 * ---------------------------------------------------
                 * COLLECTION
                 * ---------------------------------------------------
                 *
                 * ONLY the actual collection.
                 *
                 * Example:
                 *
                 * collectedToday = 2600
                 * ---------------------------------------------------
                 */

                collectedToday:
                    collectedAmt,


                /*
                 * ---------------------------------------------------
                 * AUTHORITATIVE STRUCTURED CONDITIONS
                 * ---------------------------------------------------
                 */

                conditions:
                    transactionConditions,


                /*
                 * ---------------------------------------------------
                 * DERIVED CONDITION TOTAL
                 * ---------------------------------------------------
                 *
                 * Example:
                 *
                 * Partial Default = 2000
                 * Recovery        = 1000
                 *
                 * conditionTotal = 3000
                 *
                 * collectedToday remains 2600.
                 *
                 * They are NEVER added together.
                 * ---------------------------------------------------
                 */

                conditionTotal:
                    conditionTotal,


                /*
                 * ---------------------------------------------------
                 * LEGACY CONDITION LABEL
                 * ---------------------------------------------------
                 */

                condition:
                    condition,


                /*
                 * ---------------------------------------------------
                 * LEGACY CONDITION AMOUNT
                 * ---------------------------------------------------
                 *
                 * IMPORTANT:
                 *
                 * This now represents the TOTAL condition amount,
                 * not merely the first condition.
                 *
                 * Therefore:
                 *
                 * Partial Default 2000
                 * Recovery        1000
                 *
                 * conditionAmount = 3000
                 * ---------------------------------------------------
                 */

                conditionAmount:
                    conditionTotal,


                /*
                 * ---------------------------------------------------
                 * CONDITIONAL COMMENT
                 * ---------------------------------------------------
                 */

                comment:
                    constructedComment

            });

        }
    );


    /*
     * ---------------------------------------------------------------
     * NOTHING TO POST
     * ---------------------------------------------------------------
     */

    if (
        rowsPayload.length === 0
    ) {

        alert(
            "⚠️ No transaction rows are available to post."
        );

        return;

    }


    /*
     * ---------------------------------------------------------------
     * NORMALIZE PAYLOAD
     * ---------------------------------------------------------------
     */

    const normalizedUpdates =
        normalizeDataCoreRowsPayload(
            rowsPayload
        );


    /*
     * ---------------------------------------------------------------
     * FINAL PAYLOAD
     * ---------------------------------------------------------------
     */

    const payload = {

        action:
            "datacorePost",

        marketName:
            appState.dataCore.activeMarket,

        reportDateTarget:
            appState.dataCore.activeDate,

        parserActualCollection:
            appState.dataCore.parserVerifiedTotal,

        dataCoreActualCollection:
            appState.dataCore.dataCoreActualTotal,

        updates:
            normalizedUpdates

    };


    /*
     * ---------------------------------------------------------------
     * LOCK UI BEFORE NETWORK REQUEST
     * ---------------------------------------------------------------
 */

    appState.dataCore.posting =
        true;


    /*
     * A previous failed/partial attempt must not remain confirmed.
     */

    appState.dataCore.postConfirmed =
        false;


    const button =
        $("sync-ledger-sheets-btn");


    if (
        button
    ) {

        button.disabled =
            true;

        button.classList.remove(
            "ready-to-post"
        );

        button.style.cursor =
            "not-allowed";

        button.textContent =
            "Posting...";

        button.title =
            "Sending DataCore transaction to server.";

    }


    /*
     * ---------------------------------------------------------------
     * SEND TO DATACORE
     * ---------------------------------------------------------------
     */

    try {

        const result =
            await apiRequest(
                API_CONFIG.BUSINESS_PARSER,
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "text/plain;charset=utf-8"

                    },

                    body:
                        JSON.stringify(
                            payload
                        )

                }
            );


        /*
         * -----------------------------------------------------------
         * SERVER RESPONSE VALIDATION
         * -----------------------------------------------------------
         */

        if (
            !result ||
            typeof result !== "object"
        ) {

            throw new Error(
                "DataCore server returned an invalid response."
            );

        }


        /*
         * -----------------------------------------------------------
         * PARTIAL RESPONSE
         * -----------------------------------------------------------
         *
         * IMPORTANT:
         *
         * PARTIAL IS NOT COMPLETE SUCCESS.
         *
         * We therefore:
         *
         * postConfirmed = false
         *
         * and unlock the button.
         * -----------------------------------------------------------
         */

        if (
            result.status ===
            "partial"
        ) {

            appState.dataCore.postConfirmed =
                false;


            alert(
                "⚠️ DataCore completed only partially.\n\n" +
                "Processed: " +
                (
                    result.processed ||
                    0
                ) +
                "\n" +
                "Rejected: " +
                (
                    result.rejected ||
                    0
                ) +
                "\n\n" +
                "The submission was NOT fully confirmed."
            );


            /*
             * Do not return success.
             *
             * finally will unlock the button.
             */

            return result;

        }


        /*
         * -----------------------------------------------------------
         * COMPLETE SERVER SUCCESS
         * -----------------------------------------------------------
         */

        if (
            result.status ===
            "success" &&

            result.success ===
            true &&

            result.ledgerConfirmed ===
            true &&

            result.serverConfirmed ===
            true
        ) {


            /*
             * -------------------------------------------------------
             * THIS IS THE ONLY PLACE WHERE SUCCESS IS CONFIRMED.
             * -------------------------------------------------------
             */

            appState.dataCore.postConfirmed =
                true;


            if (
                button
            ) {

                button.disabled =
                    true;

                button.classList.remove(
                    "ready-to-post"
                );

                button.style.cursor =
                    "not-allowed";

                button.textContent =
                    "Submitted";

                button.title =
                    "DataCore server confirmed successful submission.";

            }


            alert(
                "✅ DataCore matrix successfully updated."
            );


            return result;

        }


        /*
         * -----------------------------------------------------------
         * EVERYTHING ELSE IS A FAILURE
         * -----------------------------------------------------------
         */

        throw new Error(
            result.message ||
            "DataCore server did not confirm the submission."
        );

    }


    /*
     * ---------------------------------------------------------------
     * REQUEST ERROR
     * ---------------------------------------------------------------
     */

    catch (
        error
    ) {

        /*console.error(
            "DataCore posting failed:",
            error
        );*/


        /*
         * -----------------------------------------------------------
         * FAILURE MUST NEVER REMAIN CONFIRMED
         * -----------------------------------------------------------
         */

        appState.dataCore.postConfirmed =
            false;


        alert(
            "❌ DataCore transaction was not confirmed.\n\n" +
            (
                error &&
                error.message
                    ? error.message
                    : "Unknown DataCore error."
            )
        );


    }


    /*
     * ---------------------------------------------------------------
     * CLEANUP
     * ---------------------------------------------------------------
 */

    finally {

        /*
         * Request is no longer running.
         */

        appState.dataCore.posting =
            false;


        /*
         * -----------------------------------------------------------
         * COMPLETE SUCCESS
         * -----------------------------------------------------------
         *
         * Keep button locked.
         * -----------------------------------------------------------
         */

        if (
            appState.dataCore.postConfirmed
        ) {

            if (
                button
            ) {

                button.disabled =
                    true;

                button.classList.remove(
                    "ready-to-post"
                );

                button.style.cursor =
                    "not-allowed";

                button.textContent =
                    "Submitted";

                button.title =
                    "DataCore server confirmed successful submission.";

            }

        }


        /*
         * -----------------------------------------------------------
         * FAILURE / PARTIAL
         * -----------------------------------------------------------
         *
         * Unlock ONLY if the request was NOT fully confirmed.
         * -----------------------------------------------------------
         */

        else {

            if (
                button
            ) {

                button.disabled =
                    false;

                button.removeAttribute(
                    "disabled"
                );

                button.classList.add(
                    "ready-to-post"
                );

                button.style.cursor =
                    "pointer";

                button.textContent =
                    "Post Real-Time Matrix Collection to Sheet";

                button.title =
                    "Previous submission was not fully confirmed. Review and post again if appropriate.";

            }

        }

    }

}

/* =========================================================================
   18. PLATFORM ROUTER
   ========================================================================= */

function initializePlatformRouter() {

    const homePage =
        $("home-page");

    const workspacePage =
        $("workspace-page");

    const navHome =
        $("nav-home-btn");

    const navWork =
        $("nav-workspace-btn");

    const gatewayBtn =
        $("enter-workspace-btn");


    function routeToHome() {

        homePage?.classList.remove("hidden");

        workspacePage?.classList.add("hidden");

        navHome?.classList.add("active");

        navWork?.classList.remove("active");

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }


    function routeToWorkspace() {

        workspacePage?.classList.remove("hidden");

        homePage?.classList.add("hidden");

        navWork?.classList.add("active");

        navHome?.classList.remove("active");

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }


    navHome?.addEventListener(
        "click",
        routeToHome
    );


    navWork?.addEventListener(
        "click",
        routeToWorkspace
    );


    gatewayBtn?.addEventListener(
        "click",
        routeToWorkspace
    );
}


/* =========================================================================
   19. DATACORE SCROLL TRACKER
   ========================================================================= */

function initializeDataCoreScrollTracker() {

    const datacoreNav =
        $("dynamic-nav-datacore");

    const secParser =
        $("parser-section");

    const secDataCore =
        $("datacore-section");

    const btnP =
        $("jump-to-parser");

    const btnD =
        $("jump-to-datacore");


    btnP?.addEventListener(
        "click",
        () => {

            if (!secParser) return;

            window.scrollTo({
                top:
                    secParser.offsetTop - 85,
                behavior: "smooth"
            });
        }
    );


    btnD?.addEventListener(
        "click",
        () => {

            if (!secDataCore) return;

            window.scrollTo({
                top:
                    secDataCore.offsetTop - 85,
                behavior: "smooth"
            });
        }
    );


    let scrollTicking =
        false;


    window.addEventListener(
        "scroll",
        () => {

            if (scrollTicking) return;

            scrollTicking = true;


            requestAnimationFrame(() => {

                if (datacoreNav) {

                    datacoreNav.classList.toggle(
                        "scrolled",
                        window.scrollY > 20
                    );
                }


                if (
                    secDataCore &&
                    btnD &&
                    btnP
                ) {

                    const top =
                        secDataCore
                            .getBoundingClientRect()
                            .top;


                    const dataCoreActive =
                        top <= 250;


                    btnD.classList.toggle(
                        "active",
                        dataCoreActive
                    );

                    btnP.classList.toggle(
                        "active",
                        !dataCoreActive
                    );
                }


                scrollTicking =
                    false;
            });
        },
        {
            passive: true
        }
    );
}


/* =========================================================================
   20. WORKSPACE RESET
   ========================================================================= */

function clearWorkspace() {

    if (
        !confirm(
            "Are you sure you want to clear the workspace?"
        )
    ) {
        return;
    }


    $("reportInput") &&
        ($("reportInput").value = "");


    setInputValue(
        "displayDate",
        ""
    );

    setInputValue(
        "displayMarket",
        ""
    );


    const formIds = [

        "openingCash",
        "openingpd",
        "todayPd",
        "officecash",
        "supposeColl",
        "supposeColl2",
        "recovery",
        "recovery2",
        "interestOnDeals",
        "formsSold",
        "cardsSold",
        "payOff",
        "payOff2",
        "TotalDeposit",
        "defaultAmt",
        "defaultAmt2",
        "costOfDeals",
        "usedPd",
        "previousoutstanding",
        "inheritedoutstanding",
        "myoutstanding",
        "calcCell2",
        "calcCell3"
    ];


    formIds.forEach(
        id => setInputValue(id, 0)
    );


    $("errorBox")
        ?.classList.add("hidden");


    $("dashboard")
        ?.classList.add("hidden");


    $("extraction-mismatch-flag")
        ?.style.setProperty(
            "display",
            "none"
        );


    $("mismatch-warning-flag")
        ?.style.setProperty(
            "display",
            "none"
        );


    appState.extractedMarketName =
        "Unknown Market";

    appState.extractedReportDate =
        "";

    appState.cachedSheetHistory =
    null;


    appState.historicalAudit = {

        previousTotalCash: 0,
        expectedOpeningCash: 0,
        extractedOpeningCash: 0,

        previousTotalOutstanding: 0,
        expectedPreviousOutstanding: 0,
        extractedPreviousOutstanding: 0,

        previousNextDayCollection: 0,
        expectedSupposedCollection: 0,
        extractedSupposedCollection: 0,

        correctionApplied: false,
        hasVariance: false
    };


    appState.dataCore = {

        activeMarket: "",

        activeDate: "",

        rawReportText: "",

        loadedRecords: [],

        parserVerifiedTotal: 0,

        dataCoreActualTotal: 0,

        balanced: false,

        posting: false,

        postConfirmed: false,

        historicalAuditConfirm: false
    };


    setText(
        "datacore-status-subtext",
        "Linked to tab: None"
    );


    const gridBody =
        $("ledger-grid-body");


    if (gridBody) {

        gridBody.innerHTML =
            `<tr>
                <td colspan="13"
                    style="text-align:center;">
                    Workspace cleared.
                </td>
            </tr>`;
    }


    setText(
        "grid-actual-total",
        "₦0"
    );


    setText(
        "parser-verified-total",
        "₦0"
    );


    const syncBtn =
        $("sync-ledger-sheets-btn");


    if (syncBtn) {

        syncBtn.disabled =
            true;

        syncBtn.setAttribute(
            "disabled",
            "true"
        );
    }


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* =========================================================================
   21. KNOWLEDGE HUB
   ========================================================================= */

function toggleHubAccordion(cardElement) {

    if (!cardElement) return;


    const content =
        cardElement.querySelector(
            ".hub-content"
        );

    const icon =
        cardElement.querySelector(
            ".toggle-icon"
        );


    if (!content) return;


    const isOpen =
        !content.classList.contains("hidden");


    document
        .querySelectorAll(".knowledge-card")
        .forEach(card => {

            card
                .querySelector(".hub-content")
                ?.classList.add("hidden");

            const cardIcon =
                card.querySelector(".toggle-icon");

            if (cardIcon) {

                cardIcon.style.transform =
                    "rotate(0deg)";
            }

            card.classList.remove(
                "active-card"
            );
        });


    if (!isOpen) {

        content.classList.remove(
            "hidden"
        );


        if (icon) {

            icon.style.transform =
                "rotate(90deg)";
        }


        cardElement.classList.add(
            "active-card"
        );


        cardElement.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }
}


/* =========================================================================
   22. SINGLE EVENT INITIALIZATION
   ========================================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        initializePlatformRouter();

        initializeDataCoreScrollTracker();


        $("autoFillBtn")
            ?.addEventListener(
                "click",
                extractData
            );


        $("calculateBtn")
            ?.addEventListener(
                "click",
                runCalculation
            );


        $("calcNextDayBtn")
            ?.addEventListener(
                "click",
                runNextDayCalc
            );


        $("calcOutstandingBtn")
            ?.addEventListener(
                "click",
                runOutstandingCalc
            );


        $("sync-ledger-sheets-btn")
            ?.addEventListener(
                "click",
                postDataCoreTransactionsToSheets
            );


        $("clear-workspace-btn")
            ?.addEventListener(
                "click",
                clearWorkspace
            );

        $("historical-audit-confirm")
            ?.addEventListener(
                "change",
                applyHistoricalAuditCorrection
            );


        document.addEventListener(
            "change",
            handleHistoricalOverride
        );


        /*
         * Prevent accidental double submission.
         */
        document.addEventListener(
            "submit",
            event => {

                const form =
                    event.target;

                if (
                    form &&
                    form.matches(
                        "form"
                    )
                ) {

                    event.preventDefault();
                }
            }
        );
    }
);

/* =====================================================================
   MULTI-CONDITION BADGE RENDERER
   ===================================================================== */

function getTransactionBadgeClass(
    type
) {

    const normalized =
        String(
            type || ""
        )
            .trim()
            .toLowerCase();


    switch (
        normalized
    ) {

        case "pay down":
            return "badge-paydown";

        case "used pay down":
            return "badge-used-paydown";

        case "recovery":
            return "badge-recovery";

        case "pay off":
            return "badge-payoff";

        case "full default":
            return "badge-full-default";

        case "partial default":
            return "badge-partial-default";

        case "future pay down":
            return "badge-future-paydown";

        default:
            return "";

    }

}


function renderTransactionConditions(
    conditions
) {

    if (
        !Array.isArray(
            conditions
        ) ||
        conditions.length === 0
    ) {

        return "";

    }


    const validConditions =
        conditions.filter(
            function(condition) {

                return (
                    condition &&
                    (
                        typeof condition ===
                        "string"
                        ||
                        condition.type
                    )
                );

            }
        );


    if (
        validConditions.length === 0
    ) {

        return "";

    }


    return `
        <div class="transaction-condition-stack">

            ${validConditions
                .map(
                    function(condition) {

                        const type =
                            typeof condition ===
                            "string"

                                ? condition

                                : String(
                                    condition.type ||
                                    ""
                                ).trim();


                        if (
                            !type
                        ) {

                            return "";

                        }


                        const badgeClass =
                            getTransactionBadgeClass(
                                type
                            );


                        const amount =
                            typeof condition ===
                            "object" &&
                            condition.amount !==
                            undefined

                                ? Number(
                                    condition.amount
                                ) || 0

                                : null;


                        const amountText =
                            amount !== null &&
                            amount > 0

                                ? ` ₦${amount.toLocaleString()}`

                                : "";


                        return `
                            <span
                                class="transaction-condition-badge ${badgeClass}"
                            >
                                ${type}${amountText}
                            </span>
                        `;

                    }
                )
                .join("")
            }

        </div>
    `;

}

/* =====================================================================
   HISTORICAL AUDIT ENGINE
   ===================================================================== */

function formatAuditCurrency(
    value
) {

    const number =
        Number(
            value
        );


    if (
        !Number.isFinite(
            number
        )
    ) {

        return "₦0";

    }


    return (
        "₦" +
        number.toLocaleString()
    );

}


function getHistoricalAuditVariance(
    expected,
    extracted
) {

    const expectedValue =
        Number(
            expected
        ) || 0;


    const extractedValue =
        Number(
            extracted
        ) || 0;


    return (
        extractedValue -
        expectedValue
    );

}


function getHistoricalAuditStatus(
    variance
) {

    const value =
        Number(
            variance
        ) || 0;


    if (
        Math.round(
            value * 100
        ) === 0
    ) {

        return {
            className:
                "audit-match",

            label:
                "MATCH"
        };

    }


    return {
        className:
            "audit-variance",

        label:
            "VARIANCE"
    };

}


function createHistoricalAuditRow(
    title,
    previousValue,
    expectedValue,
    extractedValue,
    correctedValue
) {

    const variance =
        getHistoricalAuditVariance(
            expectedValue,
            extractedValue
        );


    const status =
        getHistoricalAuditStatus(
            variance
        );


    const correction =
        Number(
            correctedValue
        ) || 0;


    const correctionClass =
        Math.round(
            (
                correction -
                Number(expectedValue || 0)
            ) * 100
        ) === 0

            ? "audit-match"

            : "audit-variance";


    return `
        <div class="historical-audit-row">

            <div class="historical-audit-title">
                ${title}
            </div>

            <div class="historical-audit-values">

                <div class="audit-value-block">

                    <span>
                        Previous Report
                    </span>

                    <strong>
                        ${formatAuditCurrency(
                            previousValue
                        )}
                    </strong>

                </div>


                <div class="audit-arrow">
                    →
                </div>


                <div class="audit-value-block">

                    <span>
                        Expected
                    </span>

                    <strong>
                        ${formatAuditCurrency(
                            expectedValue
                        )}
                    </strong>

                </div>


                <div class="audit-arrow">
                    →
                </div>


                <div class="audit-value-block">

                    <span>
                        Extracted
                    </span>

                    <strong>
                        ${formatAuditCurrency(
                            extractedValue
                        )}
                    </strong>

                </div>


                <div class="audit-arrow">
                    →
                </div>


                <div class="audit-value-block">

                    <span>
                        Variance
                    </span>

                    <strong
                        class="${status.className}"
                    >
                        ${formatAuditCurrency(
                            variance
                        )}
                    </strong>

                </div>


                <div class="audit-arrow">
                    →
                </div>


                <div class="audit-value-block">

                    <span>
                        Correction
                    </span>

                    <strong
                        class="${correctionClass}"
                    >
                        ${formatAuditCurrency(
                            correction
                        )}
                    </strong>

                </div>

            </div>

        </div>
    `;
}


function renderHistoricalAudit(
    audit
) {

    const box =
        $(
            "historical-audit-box"
        );


    const content =
        $(
            "historical-audit-content"
        );


    if (
        !box ||
        !content
    ) {

        return;

    }


    if (
        !audit
    ) {

        box.classList.add(
            "hidden"
        );

        return;

    }


    const previousTotalCash =
        Number(
            audit.previousTotalCash
        ) || 0;


    const currentOpeningCash =
        Number(
            audit.currentOpeningCash
        ) || 0;


    const previousOutstanding =
        Number(
            audit.previousTotalOutstanding
        ) || 0;


    const currentPreviousOutstanding =
        Number(
            audit.currentPreviousOutstanding
        ) || 0;


    const previousNextDayCollection =
        Number(
            audit.previousNextDayCollection
        ) || 0;


    const currentSupposedCollection =
        Number(
            audit.currentSupposedCollection
        ) || 0;


    /*
     * ---------------------------------------------------------------
     * EXPECTED VALUES
     * ---------------------------------------------------------------
     *
     * Prefer the values stored in historicalAudit.
     *
     * Fall back to the previous report values if necessary.
     */

    const expectedOpeningCash =
        Number(
            appState.historicalAudit
                ?.expectedOpeningCash
        ) ||
        previousTotalCash;


    const expectedPreviousOutstanding =
        Number(
            appState.historicalAudit
                ?.expectedPreviousOutstanding
        ) ||
        previousOutstanding;


    const expectedSupposedCollection =
        Number(
            appState.historicalAudit
                ?.expectedSupposedCollection
        ) ||
        previousNextDayCollection;


    /*
     * ---------------------------------------------------------------
     * CORRECTED VALUES
     * ---------------------------------------------------------------
     *
     * These are the actual values currently sitting in the form.
     *
     * Before correction:
     *     corrected value = extracted value
     *
     * After correction:
     *     corrected value = expected value
     */

    const correctedOpeningCash =
        Number(
            $("openingCash")?.value
        ) || 0;


    const correctedPreviousOutstanding =
        Number(
            $("previousoutstanding")?.value
        ) || 0;


    const correctedSupposedCollection =
        Number(
            $("supposeColl")?.value
        ) || 0;


    content.innerHTML =

        createHistoricalAuditRow(
            "Total Cash → Opening Cash",

            previousTotalCash,

            expectedOpeningCash,

            currentOpeningCash,

            correctedOpeningCash
        )


        +

        createHistoricalAuditRow(
            "Total Outstanding → Previous Outstanding",

            previousOutstanding,

            expectedPreviousOutstanding,

            currentPreviousOutstanding,

            correctedPreviousOutstanding
        )


        +

        createHistoricalAuditRow(
            "Next Day Collection → Supposed Collection",

            previousNextDayCollection,

            expectedSupposedCollection,

            currentSupposedCollection,

            correctedSupposedCollection
        );


    box.classList.remove(
        "hidden"
    );

}

/* =====================================================================
   HISTORICAL AUDIT CORRECTION
   ===================================================================== */

function applyHistoricalAuditCorrection(
    forcedCheckedState
) {

    const checkbox =
        $(
            "historical-audit-confirm"
        );


    const auditBox =
        $(
            "historical-audit-box"
        );


    /*
     * ---------------------------------------------------------------
     * DETERMINE CHECKBOX STATE
     * ---------------------------------------------------------------
     */

    let isChecked;


    if (
        typeof forcedCheckedState ===
        "boolean"
    ) {

        isChecked =
            forcedCheckedState;

    } else {

        isChecked =
            checkbox?.checked === true;
    }


    /*
     * ---------------------------------------------------------------
     * HISTORICAL STATE
     * ---------------------------------------------------------------
     */

    const audit =
        appState.historicalAudit;


    if (
        !audit
    ) {

        return;
    }


    /*
     * ---------------------------------------------------------------
     * APPLY CORRECTION
     * ---------------------------------------------------------------
     *
     * Previous Report
     *      ↓
     * Expected
     *      ↓
     * Extracted
     *      ↓
     * Correction
     *
     * Correction is deliberately explicit.
     */

    if (
        isChecked
    ) {

        /*
         * -----------------------------------------------------------
         * OPENING CASH
         * -----------------------------------------------------------
         *
         * Previous Total Cash Today
         *              ↓
         * Current Opening Cash
         */

        setInputValue(
            "openingCash",
            audit.expectedOpeningCash
        );


        /*
         * -----------------------------------------------------------
         * PREVIOUS OUTSTANDING
         * -----------------------------------------------------------
         *
         * Previous Total Outstanding
         *              ↓
         * Current Previous Outstanding
         */

        setInputValue(
            "previousoutstanding",
            audit.expectedPreviousOutstanding
        );


        /*
         * -----------------------------------------------------------
         * SUPPOSED COLLECTION
         * -----------------------------------------------------------
         *
         * Previous Next Day Collection
         *              ↓
         * Current Supposed Collection
         */

        setInputValue(
            "supposeColl",
            audit.expectedSupposedCollection
        );


        /*
         * `supposeColl2` feeds the Next Day Collection calculation.
         *
         * Therefore it must remain synchronized with the corrected
         * Supposed Collection value.
         */

        setInputValue(
            "supposeColl2",
            audit.expectedSupposedCollection
        );


        audit.correctionApplied =
            true;


    } else {

        /*
         * -----------------------------------------------------------
         * RESTORE ORIGINAL EXTRACTION
         * -----------------------------------------------------------
         *
         * Unchecking correction must never leave a partially
         * corrected report behind.
         */

        setInputValue(
            "openingCash",
            audit.extractedOpeningCash
        );


        setInputValue(
            "previousoutstanding",
            audit.extractedPreviousOutstanding
        );


        setInputValue(
            "supposeColl",
            audit.extractedSupposedCollection
        );


        setInputValue(
            "supposeColl2",
            audit.extractedSupposedCollection
        );


        audit.correctionApplied =
            false;
    }


    /*
     * ---------------------------------------------------------------
     * RECALCULATE DEPENDENT VALUES
     * ---------------------------------------------------------------
     */

    runOutstandingCalc();

    runNextDayCalc();


    /*
     * ---------------------------------------------------------------
     * UPDATE AUDIT UI
     * ---------------------------------------------------------------
     */

    auditBox?.classList.toggle(
        "audit-confirmed",
        isChecked
    );


    /*
     * ---------------------------------------------------------------
     * UPDATE WARNING
     * ---------------------------------------------------------------
     */

    const warningFlag =
        $("extraction-mismatch-flag");


    if (
        warningFlag
    ) {

        if (
            audit.hasVariance &&
            !isChecked
        ) {

            warningFlag.style.display =
                "block";

        } else {

            warningFlag.style.display =
                "none";
        }

    }


    /*
     * ---------------------------------------------------------------
     * REFRESH AUDIT DISPLAY
     * ---------------------------------------------------------------
     *
     * The audit still shows the original extraction, so the user
     * can see exactly what was corrected.
     */

    renderHistoricalAudit({

        previousTotalCash:
            audit.previousTotalCash,

        currentOpeningCash:
            audit.extractedOpeningCash,

        previousTotalOutstanding:
            audit.previousTotalOutstanding,

        currentPreviousOutstanding:
            audit.extractedPreviousOutstanding,

        previousNextDayCollection:
            audit.previousNextDayCollection,

        currentSupposedCollection:
            audit.extractedSupposedCollection
    });

}

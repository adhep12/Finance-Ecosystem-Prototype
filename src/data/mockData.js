// ─────────────────────────────────────────────────────────────────────────────
// Org / department metadata
// ─────────────────────────────────────────────────────────────────────────────

export const DEPT_NAMES = {
  '101': 'Product Design',
  '102': 'Product Engineering',
  '103': 'Operations',
}

// Department → team group number.
// Departments sharing the same group number appear on one dashboard.
// Different group numbers get their own dashboard page (future feature).
export const DEPT_TEAM_GROUPS = {
  '101': 1,
  '102': 1,
  '103': 1,
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Actuals — Oct 2025 → May 2026
// account  = descriptive GL account name
// grant    = grant/fund code or null
// ─────────────────────────────────────────────────────────────────────────────

export const mockActuals = [

  // ═══ DEPT 101 — Product Design ═══════════════════════════════════════════

  // October 2025
  { date:"2025-10-01", amount:12800,  department:"101", vendor:"Amazon Web Services",  category:"Software",   account:"Cloud Infrastructure",   grant:null,        description:"Monthly cloud hosting" },
  { date:"2025-10-03", amount:34500,  department:"101", vendor:"Apple Inc.",            category:"Computers",  account:"Computer Hardware",       grant:null,        description:"MacBook Pro x3" },
  { date:"2025-10-05", amount:2340,   department:"101", vendor:"Delta Airlines",        category:"Travel",     account:"Airfare",                 grant:null,        description:"Conference flights – NYC" },
  { date:"2025-10-07", amount:1200,   department:"101", vendor:"Marriott Hotels",       category:"Travel",     account:"Lodging",                 grant:null,        description:"Conference hotel" },
  { date:"2025-10-09", amount:5800,   department:"101", vendor:"Microsoft 365",         category:"Software",   account:"Software Subscriptions",  grant:null,        description:"Annual licensing" },
  { date:"2025-10-12", amount:18000,  department:"101", vendor:"Dell Technologies",     category:"Computers",  account:"Computer Hardware",       grant:null,        description:"Monitors & docking stations" },
  { date:"2025-10-14", amount:3200,   department:"101", vendor:"Slack Technologies",    category:"Software",   account:"Communication Tools",     grant:null,        description:"Team workspace plan" },
  { date:"2025-10-16", amount:8500,   department:"101", vendor:"Content Square Inc.",   category:"Contract",   account:"SaaS Contracts",          grant:null,        description:"Analytics platform – Oct" },
  { date:"2025-10-18", amount:6750,   department:"101", vendor:"MUX Inc.",              category:"Contract",   account:"Platform Contracts",      grant:null,        description:"Video streaming platform" },
  { date:"2025-10-21", amount:890,    department:"101", vendor:"Staples",               category:"Office",     account:"Office Supplies",         grant:null,        description:"Office supplies" },
  { date:"2025-10-23", amount:4500,   department:"101", vendor:"Figma",                 category:"Software",   account:"Design Tools",            grant:"DESIGN-24", description:"Design tool annual" },
  { date:"2025-10-25", amount:15200,  department:"101", vendor:"Apple Inc.",            category:"Computers",  account:"Computer Hardware",       grant:null,        description:"iPad Pro x4" },
  { date:"2025-10-28", amount:2100,   department:"101", vendor:"Uber for Business",     category:"Travel",     account:"Ground Transport",        grant:null,        description:"Ground transportation" },
  { date:"2025-10-30", amount:1450,   department:"101", vendor:"Amazon Web Services",   category:"Software",   account:"Cloud Infrastructure",   grant:null,        description:"Data transfer overage" },

  // November 2025
  { date:"2025-11-01", amount:12800,  department:"101", vendor:"Amazon Web Services",   category:"Software",   account:"Cloud Infrastructure",   grant:null,        description:"Monthly cloud hosting" },
  { date:"2025-11-03", amount:68000,  department:"101", vendor:"Dell Technologies",     category:"Computers",  account:"Computer Hardware",       grant:null,        description:"Q4 hardware refresh – laptops x8" },
  { date:"2025-11-05", amount:22000,  department:"101", vendor:"Apple Inc.",            category:"Computers",  account:"Computer Hardware",       grant:null,        description:"MacBook Air x2, iPhone x3" },
  { date:"2025-11-07", amount:8500,   department:"101", vendor:"Content Square Inc.",   category:"Contract",   account:"SaaS Contracts",          grant:null,        description:"Analytics platform – Nov" },
  { date:"2025-11-10", amount:6750,   department:"101", vendor:"MUX Inc.",              category:"Contract",   account:"Platform Contracts",      grant:null,        description:"Video streaming platform" },
  { date:"2025-11-12", amount:3750,   department:"101", vendor:"Delta Airlines",        category:"Travel",     account:"Airfare",                 grant:null,        description:"Team offsite flights" },
  { date:"2025-11-13", amount:4200,   department:"101", vendor:"Marriott Hotels",       category:"Travel",     account:"Lodging",                 grant:null,        description:"Team offsite hotel" },
  { date:"2025-11-14", amount:1890,   department:"101", vendor:"Expensify",             category:"Software",   account:"Software Subscriptions",  grant:null,        description:"Expense management" },
  { date:"2025-11-17", amount:12500,  department:"101", vendor:"Logitech",              category:"Computers",  account:"AV & Peripherals",        grant:null,        description:"Peripherals & accessories" },
  { date:"2025-11-19", amount:6200,   department:"101", vendor:"GitHub",                category:"Software",   account:"Developer Tools",         grant:"ARCH-2025", description:"Enterprise plan" },
  { date:"2025-11-21", amount:980,    department:"101", vendor:"Staples",               category:"Office",     account:"Office Supplies",         grant:null,        description:"Office supplies" },
  { date:"2025-11-24", amount:3200,   department:"101", vendor:"Slack Technologies",    category:"Software",   account:"Communication Tools",     grant:null,        description:"Team workspace plan" },
  { date:"2025-11-26", amount:5400,   department:"101", vendor:"Adobe Creative Cloud",  category:"Software",   account:"Design Tools",            grant:"DESIGN-24", description:"Creative suite licenses" },

  // December 2025
  { date:"2025-12-01", amount:12800,  department:"101", vendor:"Amazon Web Services",   category:"Software",   account:"Cloud Infrastructure",   grant:null,        description:"Monthly cloud hosting" },
  { date:"2025-12-02", amount:8500,   department:"101", vendor:"Content Square Inc.",   category:"Contract",   account:"SaaS Contracts",          grant:null,        description:"Analytics platform – Dec" },
  { date:"2025-12-03", amount:6750,   department:"101", vendor:"MUX Inc.",              category:"Contract",   account:"Platform Contracts",      grant:null,        description:"Video streaming platform" },
  { date:"2025-12-05", amount:24500,  department:"101", vendor:"Apple Inc.",            category:"Computers",  account:"Computer Hardware",       grant:null,        description:"Holiday equipment refresh" },
  { date:"2025-12-09", amount:3200,   department:"101", vendor:"Slack Technologies",    category:"Software",   account:"Communication Tools",     grant:null,        description:"Team workspace plan" },
  { date:"2025-12-11", amount:1200,   department:"101", vendor:"Uber for Business",     category:"Travel",     account:"Ground Transport",        grant:null,        description:"Ground transportation" },
  { date:"2025-12-15", amount:890,    department:"101", vendor:"Amazon",                category:"Office",     account:"Office Supplies",         grant:null,        description:"Office supplies & snacks" },
  { date:"2025-12-16", amount:6200,   department:"101", vendor:"GitHub",                category:"Software",   account:"Developer Tools",         grant:"ARCH-2025", description:"Enterprise plan" },
  { date:"2025-12-18", amount:5400,   department:"101", vendor:"Adobe Creative Cloud",  category:"Software",   account:"Design Tools",            grant:"DESIGN-24", description:"Creative suite licenses" },
  { date:"2025-12-19", amount:1890,   department:"101", vendor:"Expensify",             category:"Software",   account:"Software Subscriptions",  grant:null,        description:"Expense management" },

  // January 2026
  { date:"2026-01-02", amount:12800,  department:"101", vendor:"Amazon Web Services",   category:"Software",   account:"Cloud Infrastructure",   grant:null,        description:"Monthly cloud hosting" },
  { date:"2026-01-05", amount:84000,  department:"101", vendor:"Dell Technologies",     category:"Computers",  account:"Computer Hardware",       grant:null,        description:"Q1 hardware – laptops x10" },
  { date:"2026-01-06", amount:8500,   department:"101", vendor:"Content Square Inc.",   category:"Contract",   account:"SaaS Contracts",          grant:null,        description:"Analytics platform – Jan" },
  { date:"2026-01-07", amount:6750,   department:"101", vendor:"MUX Inc.",              category:"Contract",   account:"Platform Contracts",      grant:null,        description:"Video streaming platform" },
  { date:"2026-01-09", amount:36000,  department:"101", vendor:"Apple Inc.",            category:"Computers",  account:"Computer Hardware",       grant:null,        description:"New hire equipment batch A" },
  { date:"2026-01-12", amount:3200,   department:"101", vendor:"Slack Technologies",    category:"Software",   account:"Communication Tools",     grant:null,        description:"Team workspace plan" },
  { date:"2026-01-14", amount:4800,   department:"101", vendor:"United Airlines",       category:"Travel",     account:"Airfare",                 grant:null,        description:"Leadership summit flights" },
  { date:"2026-01-15", amount:6200,   department:"101", vendor:"GitHub",                category:"Software",   account:"Developer Tools",         grant:"ARCH-2025", description:"Enterprise plan" },
  { date:"2026-01-16", amount:5400,   department:"101", vendor:"Adobe Creative Cloud",  category:"Software",   account:"Design Tools",            grant:"DESIGN-24", description:"Creative suite licenses" },
  { date:"2026-01-19", amount:3800,   department:"101", vendor:"Marriott Hotels",       category:"Travel",     account:"Lodging",                 grant:null,        description:"Leadership summit hotel" },
  { date:"2026-01-20", amount:9200,   department:"101", vendor:"Logitech",              category:"Computers",  account:"AV & Peripherals",        grant:null,        description:"Video conferencing gear" },
  { date:"2026-01-22", amount:1890,   department:"101", vendor:"Expensify",             category:"Software",   account:"Software Subscriptions",  grant:null,        description:"Expense management" },
  { date:"2026-01-26", amount:1120,   department:"101", vendor:"Staples",               category:"Office",     account:"Office Supplies",         grant:null,        description:"Office supplies" },
  { date:"2026-01-28", amount:2600,   department:"101", vendor:"Uber for Business",     category:"Travel",     account:"Ground Transport",        grant:null,        description:"Ground transportation" },

  // February 2026
  { date:"2026-02-02", amount:12800,  department:"101", vendor:"Amazon Web Services",   category:"Software",   account:"Cloud Infrastructure",   grant:null,        description:"Monthly cloud hosting" },
  { date:"2026-02-03", amount:108000, department:"101", vendor:"MUX Inc.",              category:"Contract",   account:"Platform Contracts",      grant:null,        description:"Annual video platform renewal" },
  { date:"2026-02-04", amount:8500,   department:"101", vendor:"Content Square Inc.",   category:"Contract",   account:"SaaS Contracts",          grant:null,        description:"Analytics platform – Feb" },
  { date:"2026-02-06", amount:48000,  department:"101", vendor:"Apple Inc.",            category:"Computers",  account:"Computer Hardware",       grant:null,        description:"New hire equipment batch B" },
  { date:"2026-02-09", amount:3200,   department:"101", vendor:"Slack Technologies",    category:"Software",   account:"Communication Tools",     grant:null,        description:"Team workspace plan" },
  { date:"2026-02-10", amount:6200,   department:"101", vendor:"GitHub",                category:"Software",   account:"Developer Tools",         grant:"ARCH-2025", description:"Enterprise plan" },
  { date:"2026-02-11", amount:5400,   department:"101", vendor:"Adobe Creative Cloud",  category:"Software",   account:"Design Tools",            grant:"DESIGN-24", description:"Creative suite licenses" },
  { date:"2026-02-13", amount:18500,  department:"101", vendor:"Dell Technologies",     category:"Computers",  account:"AV & Peripherals",        grant:null,        description:"Server equipment" },
  { date:"2026-02-17", amount:3600,   department:"101", vendor:"Delta Airlines",        category:"Travel",     account:"Airfare",                 grant:null,        description:"Product summit flights" },
  { date:"2026-02-18", amount:3200,   department:"101", vendor:"Marriott Hotels",       category:"Travel",     account:"Lodging",                 grant:null,        description:"Product summit hotel" },
  { date:"2026-02-19", amount:1890,   department:"101", vendor:"Expensify",             category:"Software",   account:"Software Subscriptions",  grant:null,        description:"Expense management" },
  { date:"2026-02-23", amount:980,    department:"101", vendor:"Staples",               category:"Office",     account:"Office Supplies",         grant:null,        description:"Office supplies" },
  { date:"2026-02-24", amount:4500,   department:"101", vendor:"Figma",                 category:"Software",   account:"Design Tools",            grant:"DESIGN-24", description:"Design tool renewal" },
  { date:"2026-02-25", amount:164400, department:"101", vendor:"Content Square Inc.",   category:"Contract",   account:"SaaS Contracts",          grant:null,        description:"Annual analytics renewal" },
  { date:"2026-02-26", amount:2800,   department:"101", vendor:"Uber for Business",     category:"Travel",     account:"Ground Transport",        grant:null,        description:"Ground transportation" },

  // March 2026
  { date:"2026-03-02", amount:12800,  department:"101", vendor:"Amazon Web Services",   category:"Software",   account:"Cloud Infrastructure",   grant:null,        description:"Monthly cloud hosting" },
  { date:"2026-03-04", amount:8500,   department:"101", vendor:"Content Square Inc.",   category:"Contract",   account:"SaaS Contracts",          grant:null,        description:"Analytics platform – Mar" },
  { date:"2026-03-05", amount:6750,   department:"101", vendor:"MUX Inc.",              category:"Contract",   account:"Platform Contracts",      grant:null,        description:"Video streaming platform" },
  { date:"2026-03-06", amount:96000,  department:"101", vendor:"Dell Technologies",     category:"Computers",  account:"Computer Hardware",       grant:null,        description:"Q2 hardware refresh – desktops" },
  { date:"2026-03-09", amount:3200,   department:"101", vendor:"Slack Technologies",    category:"Software",   account:"Communication Tools",     grant:null,        description:"Team workspace plan" },
  { date:"2026-03-10", amount:6200,   department:"101", vendor:"GitHub",                category:"Software",   account:"Developer Tools",         grant:"ARCH-2025", description:"Enterprise plan" },
  { date:"2026-03-11", amount:5400,   department:"101", vendor:"Adobe Creative Cloud",  category:"Software",   account:"Design Tools",            grant:"DESIGN-24", description:"Creative suite licenses" },
  { date:"2026-03-12", amount:54000,  department:"101", vendor:"Apple Inc.",            category:"Computers",  account:"Computer Hardware",       grant:null,        description:"iPad & MacBook new hires" },
  { date:"2026-03-16", amount:1890,   department:"101", vendor:"Expensify",             category:"Software",   account:"Software Subscriptions",  grant:null,        description:"Expense management" },
  { date:"2026-03-18", amount:5100,   department:"101", vendor:"United Airlines",       category:"Travel",     account:"Airfare",                 grant:null,        description:"Industry conference" },
  { date:"2026-03-19", amount:4200,   department:"101", vendor:"Marriott Hotels",       category:"Travel",     account:"Lodging",                 grant:null,        description:"Industry conference hotel" },
  { date:"2026-03-23", amount:1250,   department:"101", vendor:"Staples",               category:"Office",     account:"Office Supplies",         grant:null,        description:"Office supplies" },
  { date:"2026-03-25", amount:11800,  department:"101", vendor:"Logitech",              category:"Computers",  account:"AV & Peripherals",        grant:null,        description:"AV equipment" },
  { date:"2026-03-26", amount:3100,   department:"101", vendor:"Uber for Business",     category:"Travel",     account:"Ground Transport",        grant:null,        description:"Ground transportation" },

  // April 2026
  { date:"2026-04-01", amount:12800,  department:"101", vendor:"Amazon Web Services",   category:"Software",   account:"Cloud Infrastructure",   grant:null,        description:"Monthly cloud hosting" },
  { date:"2026-04-02", amount:8500,   department:"101", vendor:"Content Square Inc.",   category:"Contract",   account:"SaaS Contracts",          grant:null,        description:"Analytics platform – Apr" },
  { date:"2026-04-03", amount:6750,   department:"101", vendor:"MUX Inc.",              category:"Contract",   account:"Platform Contracts",      grant:null,        description:"Video streaming platform" },
  { date:"2026-04-07", amount:3200,   department:"101", vendor:"Slack Technologies",    category:"Software",   account:"Communication Tools",     grant:null,        description:"Team workspace plan" },
  { date:"2026-04-08", amount:6200,   department:"101", vendor:"GitHub",                category:"Software",   account:"Developer Tools",         grant:"ARCH-2025", description:"Enterprise plan" },
  { date:"2026-04-09", amount:5400,   department:"101", vendor:"Adobe Creative Cloud",  category:"Software",   account:"Design Tools",            grant:"DESIGN-24", description:"Creative suite licenses" },
  { date:"2026-04-10", amount:36000,  department:"101", vendor:"Apple Inc.",            category:"Computers",  account:"Computer Hardware",       grant:null,        description:"Spring hardware order" },
  { date:"2026-04-14", amount:1890,   department:"101", vendor:"Expensify",             category:"Software",   account:"Software Subscriptions",  grant:null,        description:"Expense management" },
  { date:"2026-04-16", amount:2900,   department:"101", vendor:"Delta Airlines",        category:"Travel",     account:"Airfare",                 grant:null,        description:"Team travel" },
  { date:"2026-04-17", amount:2400,   department:"101", vendor:"Marriott Hotels",       category:"Travel",     account:"Lodging",                 grant:null,        description:"Team travel hotel" },
  { date:"2026-04-22", amount:860,    department:"101", vendor:"Staples",               category:"Office",     account:"Office Supplies",         grant:null,        description:"Office supplies" },
  { date:"2026-04-24", amount:22000,  department:"101", vendor:"Dell Technologies",     category:"Computers",  account:"Computer Hardware",       grant:null,        description:"Replacement units" },
  { date:"2026-04-28", amount:1850,   department:"101", vendor:"Uber for Business",     category:"Travel",     account:"Ground Transport",        grant:null,        description:"Ground transportation" },

  // May 2026
  { date:"2026-05-01", amount:12800,  department:"101", vendor:"Amazon Web Services",   category:"Software",   account:"Cloud Infrastructure",   grant:null,        description:"Monthly cloud hosting" },
  { date:"2026-05-05", amount:8500,   department:"101", vendor:"Content Square Inc.",   category:"Contract",   account:"SaaS Contracts",          grant:null,        description:"Analytics platform – May" },
  { date:"2026-05-06", amount:6750,   department:"101", vendor:"MUX Inc.",              category:"Contract",   account:"Platform Contracts",      grant:null,        description:"Video streaming platform" },
  { date:"2026-05-08", amount:3200,   department:"101", vendor:"Slack Technologies",    category:"Software",   account:"Communication Tools",     grant:null,        description:"Team workspace plan" },
  { date:"2026-05-12", amount:18000,  department:"101", vendor:"Apple Inc.",            category:"Computers",  account:"Computer Hardware",       grant:null,        description:"New hire equipment" },
  { date:"2026-05-14", amount:6200,   department:"101", vendor:"GitHub",                category:"Software",   account:"Developer Tools",         grant:"ARCH-2025", description:"Enterprise plan" },
  { date:"2026-05-15", amount:5400,   department:"101", vendor:"Adobe Creative Cloud",  category:"Software",   account:"Design Tools",            grant:"DESIGN-24", description:"Creative suite licenses" },
  { date:"2026-05-19", amount:1890,   department:"101", vendor:"Expensify",             category:"Software",   account:"Software Subscriptions",  grant:null,        description:"Expense management" },
  { date:"2026-05-21", amount:750,    department:"101", vendor:"Staples",               category:"Office",     account:"Office Supplies",         grant:null,        description:"Office supplies" },

  // ═══ DEPT 102 — Product Engineering ══════════════════════════════════════

  // October 2025
  { date:"2025-10-02", amount:28500,  department:"102", vendor:"Google Cloud",          category:"Software",   account:"Cloud Infrastructure",   grant:"ARCH-2025", description:"GCP compute – Oct" },
  { date:"2025-10-08", amount:14200,  department:"102", vendor:"JetBrains",             category:"Software",   account:"Developer Tools",         grant:null,        description:"IDE licenses – annual" },
  { date:"2025-10-15", amount:52000,  department:"102", vendor:"Dell Technologies",     category:"Computers",  account:"Computer Hardware",       grant:null,        description:"Developer workstations x6" },
  { date:"2025-10-22", amount:3800,   department:"102", vendor:"PagerDuty",             category:"Software",   account:"Software Subscriptions",  grant:null,        description:"On-call monitoring" },
  { date:"2025-10-29", amount:6400,   department:"102", vendor:"Datadog",               category:"Software",   account:"Cloud Infrastructure",   grant:"ARCH-2025", description:"APM & log monitoring" },

  // November 2025
  { date:"2025-11-04", amount:28500,  department:"102", vendor:"Google Cloud",          category:"Software",   account:"Cloud Infrastructure",   grant:"ARCH-2025", description:"GCP compute – Nov" },
  { date:"2025-11-11", amount:9800,   department:"102", vendor:"Cloudflare",            category:"Software",   account:"Cloud Infrastructure",   grant:null,        description:"CDN & security" },
  { date:"2025-11-18", amount:38000,  department:"102", vendor:"Apple Inc.",            category:"Computers",  account:"Computer Hardware",       grant:null,        description:"MacBook Pro x4 – eng" },
  { date:"2025-11-25", amount:6400,   department:"102", vendor:"Datadog",               category:"Software",   account:"Cloud Infrastructure",   grant:"ARCH-2025", description:"APM & log monitoring" },

  // December 2025
  { date:"2025-12-03", amount:28500,  department:"102", vendor:"Google Cloud",          category:"Software",   account:"Cloud Infrastructure",   grant:"ARCH-2025", description:"GCP compute – Dec" },
  { date:"2025-12-10", amount:3800,   department:"102", vendor:"PagerDuty",             category:"Software",   account:"Software Subscriptions",  grant:null,        description:"On-call monitoring" },
  { date:"2025-12-17", amount:6400,   department:"102", vendor:"Datadog",               category:"Software",   account:"Cloud Infrastructure",   grant:"ARCH-2025", description:"APM & log monitoring" },
  { date:"2025-12-22", amount:7200,   department:"102", vendor:"Postman",               category:"Software",   account:"Developer Tools",         grant:null,        description:"API platform license" },

  // January 2026
  { date:"2026-01-03", amount:28500,  department:"102", vendor:"Google Cloud",          category:"Software",   account:"Cloud Infrastructure",   grant:"ARCH-2025", description:"GCP compute – Jan" },
  { date:"2026-01-08", amount:72000,  department:"102", vendor:"Dell Technologies",     category:"Computers",  account:"Computer Hardware",       grant:null,        description:"Q1 server hardware" },
  { date:"2026-01-13", amount:6400,   department:"102", vendor:"Datadog",               category:"Software",   account:"Cloud Infrastructure",   grant:"ARCH-2025", description:"APM & log monitoring" },
  { date:"2026-01-20", amount:4200,   department:"102", vendor:"Sentry",                category:"Software",   account:"Developer Tools",         grant:null,        description:"Error tracking platform" },
  { date:"2026-01-27", amount:3800,   department:"102", vendor:"PagerDuty",             category:"Software",   account:"Software Subscriptions",  grant:null,        description:"On-call monitoring" },

  // February 2026
  { date:"2026-02-03", amount:28500,  department:"102", vendor:"Google Cloud",          category:"Software",   account:"Cloud Infrastructure",   grant:"ARCH-2025", description:"GCP compute – Feb" },
  { date:"2026-02-09", amount:6400,   department:"102", vendor:"Datadog",               category:"Software",   account:"Cloud Infrastructure",   grant:"ARCH-2025", description:"APM & log monitoring" },
  { date:"2026-02-16", amount:32000,  department:"102", vendor:"Apple Inc.",            category:"Computers",  account:"Computer Hardware",       grant:null,        description:"Developer laptops x3" },
  { date:"2026-02-23", amount:8900,   department:"102", vendor:"Cloudflare",            category:"Software",   account:"Cloud Infrastructure",   grant:null,        description:"CDN & security – annual" },

  // March 2026
  { date:"2026-03-03", amount:28500,  department:"102", vendor:"Google Cloud",          category:"Software",   account:"Cloud Infrastructure",   grant:"ARCH-2025", description:"GCP compute – Mar" },
  { date:"2026-03-10", amount:6400,   department:"102", vendor:"Datadog",               category:"Software",   account:"Cloud Infrastructure",   grant:"ARCH-2025", description:"APM & log monitoring" },
  { date:"2026-03-17", amount:3800,   department:"102", vendor:"PagerDuty",             category:"Software",   account:"Software Subscriptions",  grant:null,        description:"On-call monitoring" },
  { date:"2026-03-24", amount:5600,   department:"102", vendor:"Linear",                category:"Software",   account:"Developer Tools",         grant:null,        description:"Project tracking" },

  // April 2026
  { date:"2026-04-03", amount:28500,  department:"102", vendor:"Google Cloud",          category:"Software",   account:"Cloud Infrastructure",   grant:"ARCH-2025", description:"GCP compute – Apr" },
  { date:"2026-04-10", amount:6400,   department:"102", vendor:"Datadog",               category:"Software",   account:"Cloud Infrastructure",   grant:"ARCH-2025", description:"APM & log monitoring" },
  { date:"2026-04-17", amount:44000,  department:"102", vendor:"Dell Technologies",     category:"Computers",  account:"Computer Hardware",       grant:null,        description:"Q2 workstations x5" },
  { date:"2026-04-24", amount:3800,   department:"102", vendor:"PagerDuty",             category:"Software",   account:"Software Subscriptions",  grant:null,        description:"On-call monitoring" },

  // May 2026
  { date:"2026-05-02", amount:28500,  department:"102", vendor:"Google Cloud",          category:"Software",   account:"Cloud Infrastructure",   grant:"ARCH-2025", description:"GCP compute – May" },
  { date:"2026-05-09", amount:6400,   department:"102", vendor:"Datadog",               category:"Software",   account:"Cloud Infrastructure",   grant:"ARCH-2025", description:"APM & log monitoring" },
  { date:"2026-05-16", amount:3800,   department:"102", vendor:"PagerDuty",             category:"Software",   account:"Software Subscriptions",  grant:null,        description:"On-call monitoring" },

  // ═══ DEPT 103 — Operations ════════════════════════════════════════════════

  // October 2025
  { date:"2025-10-06", amount:4200,   department:"103", vendor:"United Airlines",       category:"Travel",     account:"Airfare",                 grant:null,        description:"Leadership travel" },
  { date:"2025-10-13", amount:2800,   department:"103", vendor:"Zoom",                  category:"Software",   account:"Communication Tools",     grant:null,        description:"Video conferencing annual" },
  { date:"2025-10-20", amount:8900,   department:"103", vendor:"DocuSign",              category:"Software",   account:"Software Subscriptions",  grant:null,        description:"Contract signing platform" },
  { date:"2025-10-27", amount:3400,   department:"103", vendor:"Concur",                category:"Software",   account:"Software Subscriptions",  grant:null,        description:"Travel & expense mgmt" },

  // November 2025
  { date:"2025-11-03", amount:5600,   department:"103", vendor:"Delta Airlines",        category:"Travel",     account:"Airfare",                 grant:null,        description:"Operations off-site" },
  { date:"2025-11-10", amount:4100,   department:"103", vendor:"Hilton Hotels",         category:"Travel",     account:"Lodging",                 grant:null,        description:"Operations off-site hotel" },
  { date:"2025-11-17", amount:2800,   department:"103", vendor:"Zoom",                  category:"Software",   account:"Communication Tools",     grant:null,        description:"Video conferencing" },
  { date:"2025-11-24", amount:6200,   department:"103", vendor:"Salesforce",            category:"Contract",   account:"SaaS Contracts",          grant:null,        description:"CRM platform" },

  // December 2025
  { date:"2025-12-08", amount:2800,   department:"103", vendor:"Zoom",                  category:"Software",   account:"Communication Tools",     grant:null,        description:"Video conferencing" },
  { date:"2025-12-15", amount:8900,   department:"103", vendor:"DocuSign",              category:"Software",   account:"Software Subscriptions",  grant:null,        description:"Contract signing platform" },
  { date:"2025-12-22", amount:6200,   department:"103", vendor:"Salesforce",            category:"Contract",   account:"SaaS Contracts",          grant:null,        description:"CRM platform" },

  // January 2026
  { date:"2026-01-05", amount:7200,   department:"103", vendor:"United Airlines",       category:"Travel",     account:"Airfare",                 grant:null,        description:"Annual planning summit" },
  { date:"2026-01-06", amount:5400,   department:"103", vendor:"Marriott Hotels",       category:"Travel",     account:"Lodging",                 grant:null,        description:"Annual planning hotel" },
  { date:"2026-01-12", amount:2800,   department:"103", vendor:"Zoom",                  category:"Software",   account:"Communication Tools",     grant:null,        description:"Video conferencing" },
  { date:"2026-01-19", amount:6200,   department:"103", vendor:"Salesforce",            category:"Contract",   account:"SaaS Contracts",          grant:null,        description:"CRM platform" },
  { date:"2026-01-26", amount:3400,   department:"103", vendor:"Concur",                category:"Software",   account:"Software Subscriptions",  grant:null,        description:"Travel & expense mgmt" },

  // February 2026
  { date:"2026-02-02", amount:2800,   department:"103", vendor:"Zoom",                  category:"Software",   account:"Communication Tools",     grant:null,        description:"Video conferencing" },
  { date:"2026-02-09", amount:6200,   department:"103", vendor:"Salesforce",            category:"Contract",   account:"SaaS Contracts",          grant:null,        description:"CRM platform" },
  { date:"2026-02-16", amount:4300,   department:"103", vendor:"Delta Airlines",        category:"Travel",     account:"Airfare",                 grant:null,        description:"Regional manager travel" },
  { date:"2026-02-23", amount:8900,   department:"103", vendor:"DocuSign",              category:"Software",   account:"Software Subscriptions",  grant:null,        description:"Contract signing renewal" },

  // March 2026
  { date:"2026-03-02", amount:2800,   department:"103", vendor:"Zoom",                  category:"Software",   account:"Communication Tools",     grant:null,        description:"Video conferencing" },
  { date:"2026-03-09", amount:6200,   department:"103", vendor:"Salesforce",            category:"Contract",   account:"SaaS Contracts",          grant:null,        description:"CRM platform" },
  { date:"2026-03-16", amount:3400,   department:"103", vendor:"Concur",                category:"Software",   account:"Software Subscriptions",  grant:null,        description:"Travel & expense mgmt" },
  { date:"2026-03-23", amount:5800,   department:"103", vendor:"United Airlines",       category:"Travel",     account:"Airfare",                 grant:null,        description:"Q2 business travel" },

  // April 2026
  { date:"2026-04-06", amount:2800,   department:"103", vendor:"Zoom",                  category:"Software",   account:"Communication Tools",     grant:null,        description:"Video conferencing" },
  { date:"2026-04-13", amount:6200,   department:"103", vendor:"Salesforce",            category:"Contract",   account:"SaaS Contracts",          grant:null,        description:"CRM platform" },
  { date:"2026-04-20", amount:8900,   department:"103", vendor:"DocuSign",              category:"Software",   account:"Software Subscriptions",  grant:null,        description:"Contract signing platform" },
  { date:"2026-04-27", amount:4100,   department:"103", vendor:"Hilton Hotels",         category:"Travel",     account:"Lodging",                 grant:null,        description:"Ops team travel hotel" },

  // May 2026
  { date:"2026-05-04", amount:2800,   department:"103", vendor:"Zoom",                  category:"Software",   account:"Communication Tools",     grant:null,        description:"Video conferencing" },
  { date:"2026-05-11", amount:6200,   department:"103", vendor:"Salesforce",            category:"Contract",   account:"SaaS Contracts",          grant:null,        description:"CRM platform" },
  { date:"2026-05-18", amount:3400,   department:"103", vendor:"Concur",                category:"Software",   account:"Software Subscriptions",  grant:null,        description:"Travel & expense mgmt" },
]

// Rename 'department' field (old) to 'dept' for all records
// Note: Field name in actuals is 'dept' (short form). Update any references.

// ─────────────────────────────────────────────────────────────────────────────
// Flat budget — monthly amounts per category per scenario
// ─────────────────────────────────────────────────────────────────────────────

export const mockBudgetFlat = [
  // ── Planned Spend ─────────────────────────────────────────────────────────
  { department:"101", category:"Computers", scenario:"Planned Spend", monthlyAmount:55000 },
  { department:"101", category:"Software",  scenario:"Planned Spend", monthlyAmount:22000 },
  { department:"101", category:"Travel",    scenario:"Planned Spend", monthlyAmount:12000 },
  { department:"101", category:"Contract",  scenario:"Planned Spend", monthlyAmount:8500  },
  { department:"101", category:"Office",    scenario:"Planned Spend", monthlyAmount:2000  },

  { department:"102", category:"Computers", scenario:"Planned Spend", monthlyAmount:28000 },
  { department:"102", category:"Software",  scenario:"Planned Spend", monthlyAmount:32000 },
  { department:"102", category:"Travel",    scenario:"Planned Spend", monthlyAmount:2000  },
  { department:"102", category:"Contract",  scenario:"Planned Spend", monthlyAmount:1000  },

  { department:"103", category:"Software",  scenario:"Planned Spend", monthlyAmount:8000  },
  { department:"103", category:"Travel",    scenario:"Planned Spend", monthlyAmount:6000  },
  { department:"103", category:"Contract",  scenario:"Planned Spend", monthlyAmount:5000  },

  // ── Annual Plan ───────────────────────────────────────────────────────────
  { department:"101", category:"Computers", scenario:"Annual Plan", monthlyAmount:62000 },
  { department:"101", category:"Software",  scenario:"Annual Plan", monthlyAmount:25000 },
  { department:"101", category:"Travel",    scenario:"Annual Plan", monthlyAmount:10000 },
  { department:"101", category:"Contract",  scenario:"Annual Plan", monthlyAmount:7000  },
  { department:"101", category:"Office",    scenario:"Annual Plan", monthlyAmount:1800  },

  { department:"102", category:"Computers", scenario:"Annual Plan", monthlyAmount:32000 },
  { department:"102", category:"Software",  scenario:"Annual Plan", monthlyAmount:36000 },
  { department:"102", category:"Travel",    scenario:"Annual Plan", monthlyAmount:1800  },
  { department:"102", category:"Contract",  scenario:"Annual Plan", monthlyAmount:800   },

  { department:"103", category:"Software",  scenario:"Annual Plan", monthlyAmount:9000  },
  { department:"103", category:"Travel",    scenario:"Annual Plan", monthlyAmount:5500  },
  { department:"103", category:"Contract",  scenario:"Annual Plan", monthlyAmount:5500  },

  // ── Conservative ──────────────────────────────────────────────────────────
  { department:"101", category:"Computers", scenario:"Conservative", monthlyAmount:45000 },
  { department:"101", category:"Software",  scenario:"Conservative", monthlyAmount:18000 },
  { department:"101", category:"Travel",    scenario:"Conservative", monthlyAmount:9000  },
  { department:"101", category:"Contract",  scenario:"Conservative", monthlyAmount:6000  },
  { department:"101", category:"Office",    scenario:"Conservative", monthlyAmount:1500  },

  { department:"102", category:"Computers", scenario:"Conservative", monthlyAmount:22000 },
  { department:"102", category:"Software",  scenario:"Conservative", monthlyAmount:26000 },
  { department:"102", category:"Travel",    scenario:"Conservative", monthlyAmount:1500  },
  { department:"102", category:"Contract",  scenario:"Conservative", monthlyAmount:700   },

  { department:"103", category:"Software",  scenario:"Conservative", monthlyAmount:6500  },
  { department:"103", category:"Travel",    scenario:"Conservative", monthlyAmount:4500  },
  { department:"103", category:"Contract",  scenario:"Conservative", monthlyAmount:4000  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Mock comments (seed)
// ─────────────────────────────────────────────────────────────────────────────

export const mockComments = [
  {
    id: "c1",
    author: "Alex H.",
    avatar: "A",
    page: "briefing",
    text: "The spike in February is due to the annual MUX contract renewal ($108K). This is expected and within our annual commitment.",
    timestamp: "2026-03-01T09:14:00Z",
    category: "Contract",
    resolved: false,
    type: "comment",
    transactionRef: null,
  },
  {
    id: "c2",
    author: "Jordan M.",
    avatar: "J",
    page: "briefing",
    text: "Request: Can we get a breakdown of the Computers category showing purchases by employee vs shared equipment?",
    timestamp: "2026-03-05T14:22:00Z",
    category: "Computers",
    resolved: false,
    type: "request",
    transactionRef: null,
  },
  {
    id: "c3",
    author: "Sam T.",
    avatar: "S",
    page: "breakdown",
    text: "The Content Square annual renewal in February was approved in Q4 budget review. Not an overage.",
    timestamp: "2026-03-10T11:05:00Z",
    category: "Contract",
    resolved: true,
    type: "comment",
    transactionRef: null,
  },
  {
    id: "c4",
    author: "Alex H.",
    avatar: "A",
    page: "briefing",
    text: "Question: Should we be concerned about the Computers budget? We're tracking $320K over. Is this a one-time catch-up or ongoing?",
    timestamp: "2026-03-15T16:40:00Z",
    category: "Computers",
    resolved: false,
    type: "question",
    transactionRef: null,
  },
]

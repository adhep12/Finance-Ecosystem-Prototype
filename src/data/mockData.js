// ─────────────────────────────────────────────────────────────────────────────
// Mock Actuals — individual transactions, Oct 2025 – May 2026
// Fields: date, amount, department, vendor, category, account, grant, description
// ─────────────────────────────────────────────────────────────────────────────

export const mockActuals = [
  // ── October 2025 ─────────────────────────────────────────────────────────
  { date: "2025-10-01", amount: 12800,  department: "101", vendor: "Amazon Web Services",        category: "Software",   account: "6100", grant: null,    description: "Monthly cloud hosting" },
  { date: "2025-10-03", amount: 34500,  department: "101", vendor: "Apple Inc.",                 category: "Computers",  account: "6200", grant: null,    description: "MacBook Pro x3" },
  { date: "2025-10-05", amount: 2340,   department: "101", vendor: "Delta Airlines",             category: "Travel",     account: "6400", grant: null,    description: "Conference flights" },
  { date: "2025-10-07", amount: 1200,   department: "101", vendor: "Marriott Hotels",            category: "Travel",     account: "6401", grant: null,    description: "Conference hotel" },
  { date: "2025-10-09", amount: 5800,   department: "101", vendor: "Microsoft 365",              category: "Software",   account: "6101", grant: null,    description: "Annual licensing" },
  { date: "2025-10-12", amount: 18000,  department: "101", vendor: "Dell Technologies",          category: "Computers",  account: "6200", grant: null,    description: "Monitors & docking stations" },
  { date: "2025-10-14", amount: 3200,   department: "101", vendor: "Slack Technologies",         category: "Software",   account: "6102", grant: null,    description: "Team workspace plan" },
  { date: "2025-10-16", amount: 8500,   department: "101", vendor: "Content Square Inc.",        category: "Contract",   account: "6300", grant: null,    description: "Analytics platform – Oct" },
  { date: "2025-10-18", amount: 6750,   department: "101", vendor: "MUX Inc.",                   category: "Contract",   account: "6301", grant: null,    description: "Video streaming platform" },
  { date: "2025-10-21", amount: 890,    department: "101", vendor: "Staples",                    category: "Office",     account: "6500", grant: null,    description: "Office supplies" },
  { date: "2025-10-23", amount: 4500,   department: "101", vendor: "Figma",                      category: "Software",   account: "6103", grant: null,    description: "Design tool annual" },
  { date: "2025-10-25", amount: 15200,  department: "101", vendor: "Apple Inc.",                 category: "Computers",  account: "6200", grant: null,    description: "iPad Pro x4" },
  { date: "2025-10-28", amount: 2100,   department: "101", vendor: "Uber for Business",          category: "Travel",     account: "6402", grant: null,    description: "Ground transportation" },
  { date: "2025-10-30", amount: 1450,   department: "101", vendor: "Amazon Web Services",        category: "Software",   account: "6100", grant: null,    description: "Data transfer overage" },

  // ── November 2025 ────────────────────────────────────────────────────────
  { date: "2025-11-01", amount: 12800,  department: "101", vendor: "Amazon Web Services",        category: "Software",   account: "6100", grant: null,    description: "Monthly cloud hosting" },
  { date: "2025-11-03", amount: 68000,  department: "101", vendor: "Dell Technologies",          category: "Computers",  account: "6200", grant: null,    description: "Q4 hardware refresh – laptops x8" },
  { date: "2025-11-05", amount: 22000,  department: "101", vendor: "Apple Inc.",                 category: "Computers",  account: "6200", grant: null,    description: "MacBook Air x2, iPhone x3" },
  { date: "2025-11-07", amount: 8500,   department: "101", vendor: "Content Square Inc.",        category: "Contract",   account: "6300", grant: null,    description: "Analytics platform – Nov" },
  { date: "2025-11-10", amount: 6750,   department: "101", vendor: "MUX Inc.",                   category: "Contract",   account: "6301", grant: null,    description: "Video streaming platform" },
  { date: "2025-11-12", amount: 3750,   department: "101", vendor: "Delta Airlines",             category: "Travel",     account: "6400", grant: null,    description: "Team offsite flights" },
  { date: "2025-11-13", amount: 4200,   department: "101", vendor: "Marriott Hotels",            category: "Travel",     account: "6401", grant: null,    description: "Team offsite hotel" },
  { date: "2025-11-14", amount: 1890,   department: "101", vendor: "Expensify",                  category: "Software",   account: "6104", grant: null,    description: "Expense management" },
  { date: "2025-11-17", amount: 12500,  department: "101", vendor: "Logitech",                   category: "Computers",  account: "6201", grant: null,    description: "Peripherals & accessories" },
  { date: "2025-11-19", amount: 6200,   department: "101", vendor: "GitHub",                     category: "Software",   account: "6105", grant: null,    description: "Enterprise plan" },
  { date: "2025-11-21", amount: 980,    department: "101", vendor: "Staples",                    category: "Office",     account: "6500", grant: null,    description: "Office supplies" },
  { date: "2025-11-24", amount: 3200,   department: "101", vendor: "Slack Technologies",         category: "Software",   account: "6102", grant: null,    description: "Team workspace plan" },
  { date: "2025-11-26", amount: 5400,   department: "101", vendor: "Adobe Creative Cloud",       category: "Software",   account: "6106", grant: null,    description: "Creative suite licenses" },

  // ── December 2025 ────────────────────────────────────────────────────────
  { date: "2025-12-01", amount: 12800,  department: "101", vendor: "Amazon Web Services",        category: "Software",   account: "6100", grant: null,    description: "Monthly cloud hosting" },
  { date: "2025-12-02", amount: 8500,   department: "101", vendor: "Content Square Inc.",        category: "Contract",   account: "6300", grant: null,    description: "Analytics platform – Dec" },
  { date: "2025-12-03", amount: 6750,   department: "101", vendor: "MUX Inc.",                   category: "Contract",   account: "6301", grant: null,    description: "Video streaming platform" },
  { date: "2025-12-05", amount: 24500,  department: "101", vendor: "Apple Inc.",                 category: "Computers",  account: "6200", grant: null,    description: "Holiday equipment refresh" },
  { date: "2025-12-09", amount: 3200,   department: "101", vendor: "Slack Technologies",         category: "Software",   account: "6102", grant: null,    description: "Team workspace plan" },
  { date: "2025-12-11", amount: 1200,   department: "101", vendor: "Uber for Business",          category: "Travel",     account: "6402", grant: null,    description: "Ground transportation" },
  { date: "2025-12-15", amount: 890,    department: "101", vendor: "Amazon",                     category: "Office",     account: "6500", grant: null,    description: "Office supplies & snacks" },
  { date: "2025-12-16", amount: 6200,   department: "101", vendor: "GitHub",                     category: "Software",   account: "6105", grant: null,    description: "Enterprise plan" },
  { date: "2025-12-18", amount: 5400,   department: "101", vendor: "Adobe Creative Cloud",       category: "Software",   account: "6106", grant: null,    description: "Creative suite licenses" },
  { date: "2025-12-19", amount: 1890,   department: "101", vendor: "Expensify",                  category: "Software",   account: "6104", grant: null,    description: "Expense management" },

  // ── January 2026 ─────────────────────────────────────────────────────────
  { date: "2026-01-02", amount: 12800,  department: "101", vendor: "Amazon Web Services",        category: "Software",   account: "6100", grant: null,    description: "Monthly cloud hosting" },
  { date: "2026-01-05", amount: 84000,  department: "101", vendor: "Dell Technologies",          category: "Computers",  account: "6200", grant: null,    description: "Q1 hardware – laptops x10" },
  { date: "2026-01-06", amount: 8500,   department: "101", vendor: "Content Square Inc.",        category: "Contract",   account: "6300", grant: null,    description: "Analytics platform – Jan" },
  { date: "2026-01-07", amount: 6750,   department: "101", vendor: "MUX Inc.",                   category: "Contract",   account: "6301", grant: null,    description: "Video streaming platform" },
  { date: "2026-01-09", amount: 36000,  department: "101", vendor: "Apple Inc.",                 category: "Computers",  account: "6200", grant: null,    description: "New hire equipment batch A" },
  { date: "2026-01-12", amount: 3200,   department: "101", vendor: "Slack Technologies",         category: "Software",   account: "6102", grant: null,    description: "Team workspace plan" },
  { date: "2026-01-14", amount: 4800,   department: "101", vendor: "United Airlines",            category: "Travel",     account: "6400", grant: null,    description: "Leadership summit flights" },
  { date: "2026-01-15", amount: 6200,   department: "101", vendor: "GitHub",                     category: "Software",   account: "6105", grant: null,    description: "Enterprise plan" },
  { date: "2026-01-16", amount: 5400,   department: "101", vendor: "Adobe Creative Cloud",       category: "Software",   account: "6106", grant: null,    description: "Creative suite licenses" },
  { date: "2026-01-19", amount: 3800,   department: "101", vendor: "Marriott Hotels",            category: "Travel",     account: "6401", grant: null,    description: "Leadership summit hotel" },
  { date: "2026-01-20", amount: 9200,   department: "101", vendor: "Logitech",                   category: "Computers",  account: "6201", grant: null,    description: "Video conferencing gear" },
  { date: "2026-01-22", amount: 1890,   department: "101", vendor: "Expensify",                  category: "Software",   account: "6104", grant: null,    description: "Expense management" },
  { date: "2026-01-26", amount: 1120,   department: "101", vendor: "Staples",                    category: "Office",     account: "6500", grant: null,    description: "Office supplies" },
  { date: "2026-01-28", amount: 2600,   department: "101", vendor: "Uber for Business",          category: "Travel",     account: "6402", grant: null,    description: "Ground transportation" },

  // ── February 2026 ────────────────────────────────────────────────────────
  { date: "2026-02-02", amount: 12800,  department: "101", vendor: "Amazon Web Services",        category: "Software",   account: "6100", grant: null,    description: "Monthly cloud hosting" },
  { date: "2026-02-03", amount: 108000, department: "101", vendor: "MUX Inc.",                   category: "Contract",   account: "6301", grant: null,    description: "Annual video platform renewal" },
  { date: "2026-02-04", amount: 8500,   department: "101", vendor: "Content Square Inc.",        category: "Contract",   account: "6300", grant: null,    description: "Analytics platform – Feb" },
  { date: "2026-02-06", amount: 48000,  department: "101", vendor: "Apple Inc.",                 category: "Computers",  account: "6200", grant: null,    description: "New hire equipment batch B" },
  { date: "2026-02-09", amount: 3200,   department: "101", vendor: "Slack Technologies",         category: "Software",   account: "6102", grant: null,    description: "Team workspace plan" },
  { date: "2026-02-10", amount: 6200,   department: "101", vendor: "GitHub",                     category: "Software",   account: "6105", grant: null,    description: "Enterprise plan" },
  { date: "2026-02-11", amount: 5400,   department: "101", vendor: "Adobe Creative Cloud",       category: "Software",   account: "6106", grant: null,    description: "Creative suite licenses" },
  { date: "2026-02-13", amount: 18500,  department: "101", vendor: "Dell Technologies",          category: "Computers",  account: "6200", grant: null,    description: "Server equipment" },
  { date: "2026-02-17", amount: 3600,   department: "101", vendor: "Delta Airlines",             category: "Travel",     account: "6400", grant: null,    description: "Product summit flights" },
  { date: "2026-02-18", amount: 3200,   department: "101", vendor: "Marriott Hotels",            category: "Travel",     account: "6401", grant: null,    description: "Product summit hotel" },
  { date: "2026-02-19", amount: 1890,   department: "101", vendor: "Expensify",                  category: "Software",   account: "6104", grant: null,    description: "Expense management" },
  { date: "2026-02-23", amount: 980,    department: "101", vendor: "Staples",                    category: "Office",     account: "6500", grant: null,    description: "Office supplies" },
  { date: "2026-02-24", amount: 4500,   department: "101", vendor: "Figma",                      category: "Software",   account: "6103", grant: null,    description: "Design tool renewal" },
  { date: "2026-02-25", amount: 164400, department: "101", vendor: "Content Square Inc.",        category: "Contract",   account: "6300", grant: null,    description: "Annual analytics renewal" },
  { date: "2026-02-26", amount: 2800,   department: "101", vendor: "Uber for Business",          category: "Travel",     account: "6402", grant: null,    description: "Ground transportation" },

  // ── March 2026 ───────────────────────────────────────────────────────────
  { date: "2026-03-02", amount: 12800,  department: "101", vendor: "Amazon Web Services",        category: "Software",   account: "6100", grant: null,    description: "Monthly cloud hosting" },
  { date: "2026-03-04", amount: 8500,   department: "101", vendor: "Content Square Inc.",        category: "Contract",   account: "6300", grant: null,    description: "Analytics platform – Mar" },
  { date: "2026-03-05", amount: 6750,   department: "101", vendor: "MUX Inc.",                   category: "Contract",   account: "6301", grant: null,    description: "Video streaming platform" },
  { date: "2026-03-06", amount: 96000,  department: "101", vendor: "Dell Technologies",          category: "Computers",  account: "6200", grant: null,    description: "Q2 hardware refresh – desktops" },
  { date: "2026-03-09", amount: 3200,   department: "101", vendor: "Slack Technologies",         category: "Software",   account: "6102", grant: null,    description: "Team workspace plan" },
  { date: "2026-03-10", amount: 6200,   department: "101", vendor: "GitHub",                     category: "Software",   account: "6105", grant: null,    description: "Enterprise plan" },
  { date: "2026-03-11", amount: 5400,   department: "101", vendor: "Adobe Creative Cloud",       category: "Software",   account: "6106", grant: null,    description: "Creative suite licenses" },
  { date: "2026-03-12", amount: 54000,  department: "101", vendor: "Apple Inc.",                 category: "Computers",  account: "6200", grant: null,    description: "iPad & MacBook new hires" },
  { date: "2026-03-16", amount: 1890,   department: "101", vendor: "Expensify",                  category: "Software",   account: "6104", grant: null,    description: "Expense management" },
  { date: "2026-03-18", amount: 5100,   department: "101", vendor: "United Airlines",            category: "Travel",     account: "6400", grant: null,    description: "Industry conference" },
  { date: "2026-03-19", amount: 4200,   department: "101", vendor: "Marriott Hotels",            category: "Travel",     account: "6401", grant: null,    description: "Industry conference hotel" },
  { date: "2026-03-23", amount: 1250,   department: "101", vendor: "Staples",                    category: "Office",     account: "6500", grant: null,    description: "Office supplies" },
  { date: "2026-03-25", amount: 11800,  department: "101", vendor: "Logitech",                   category: "Computers",  account: "6201", grant: null,    description: "AV equipment" },
  { date: "2026-03-26", amount: 3100,   department: "101", vendor: "Uber for Business",          category: "Travel",     account: "6402", grant: null,    description: "Ground transportation" },

  // ── April 2026 ───────────────────────────────────────────────────────────
  { date: "2026-04-01", amount: 12800,  department: "101", vendor: "Amazon Web Services",        category: "Software",   account: "6100", grant: null,    description: "Monthly cloud hosting" },
  { date: "2026-04-02", amount: 8500,   department: "101", vendor: "Content Square Inc.",        category: "Contract",   account: "6300", grant: null,    description: "Analytics platform – Apr" },
  { date: "2026-04-03", amount: 6750,   department: "101", vendor: "MUX Inc.",                   category: "Contract",   account: "6301", grant: null,    description: "Video streaming platform" },
  { date: "2026-04-07", amount: 3200,   department: "101", vendor: "Slack Technologies",         category: "Software",   account: "6102", grant: null,    description: "Team workspace plan" },
  { date: "2026-04-08", amount: 6200,   department: "101", vendor: "GitHub",                     category: "Software",   account: "6105", grant: null,    description: "Enterprise plan" },
  { date: "2026-04-09", amount: 5400,   department: "101", vendor: "Adobe Creative Cloud",       category: "Software",   account: "6106", grant: null,    description: "Creative suite licenses" },
  { date: "2026-04-10", amount: 36000,  department: "101", vendor: "Apple Inc.",                 category: "Computers",  account: "6200", grant: null,    description: "Spring hardware order" },
  { date: "2026-04-14", amount: 1890,   department: "101", vendor: "Expensify",                  category: "Software",   account: "6104", grant: null,    description: "Expense management" },
  { date: "2026-04-16", amount: 2900,   department: "101", vendor: "Delta Airlines",             category: "Travel",     account: "6400", grant: null,    description: "Team travel" },
  { date: "2026-04-17", amount: 2400,   department: "101", vendor: "Marriott Hotels",            category: "Travel",     account: "6401", grant: null,    description: "Team travel hotel" },
  { date: "2026-04-22", amount: 860,    department: "101", vendor: "Staples",                    category: "Office",     account: "6500", grant: null,    description: "Office supplies" },
  { date: "2026-04-24", amount: 22000,  department: "101", vendor: "Dell Technologies",          category: "Computers",  account: "6200", grant: null,    description: "Replacement units" },
  { date: "2026-04-28", amount: 1850,   department: "101", vendor: "Uber for Business",          category: "Travel",     account: "6402", grant: null,    description: "Ground transportation" },

  // ── May 2026 ─────────────────────────────────────────────────────────────
  { date: "2026-05-01", amount: 12800,  department: "101", vendor: "Amazon Web Services",        category: "Software",   account: "6100", grant: null,    description: "Monthly cloud hosting" },
  { date: "2026-05-05", amount: 8500,   department: "101", vendor: "Content Square Inc.",        category: "Contract",   account: "6300", grant: null,    description: "Analytics platform – May" },
  { date: "2026-05-06", amount: 6750,   department: "101", vendor: "MUX Inc.",                   category: "Contract",   account: "6301", grant: null,    description: "Video streaming platform" },
  { date: "2026-05-08", amount: 3200,   department: "101", vendor: "Slack Technologies",         category: "Software",   account: "6102", grant: null,    description: "Team workspace plan" },
  { date: "2026-05-12", amount: 18000,  department: "101", vendor: "Apple Inc.",                 category: "Computers",  account: "6200", grant: null,    description: "New hire equipment" },
  { date: "2026-05-14", amount: 6200,   department: "101", vendor: "GitHub",                     category: "Software",   account: "6105", grant: null,    description: "Enterprise plan" },
  { date: "2026-05-15", amount: 5400,   department: "101", vendor: "Adobe Creative Cloud",       category: "Software",   account: "6106", grant: null,    description: "Creative suite licenses" },
  { date: "2026-05-19", amount: 1890,   department: "101", vendor: "Expensify",                  category: "Software",   account: "6104", grant: null,    description: "Expense management" },
  { date: "2026-05-21", amount: 750,    department: "101", vendor: "Staples",                    category: "Office",     account: "6500", grant: null,    description: "Office supplies" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Mock Budget — monthly amounts per category per scenario per department
// ─────────────────────────────────────────────────────────────────────────────

export const mockBudgets = [
  // ── Planned Spend scenario ────────────────────────────────────────────────
  // Computers — $55K/month
  ...Array.from({ length: 12 }, (_, i) => ({
    department: "101",
    category: "Computers",
    scenario: "Planned Spend",
    amount: 55000,
    date: `2025-${String(10 + i > 12 ? 10 + i - 12 : 10 + i).padStart(2, '0')}-01`.replace(/2025-1[3-9]/, (m) => `2026-0${m.slice(-2).replace('3','1').replace('4','2').replace('5','3').replace('6','4').replace('7','5').replace('8','6').replace('9','7')}`),
  })),
  // Software — $22K/month
  ...Array.from({ length: 12 }, (_, i) => ({
    department: "101",
    category: "Software",
    scenario: "Planned Spend",
    amount: 22000,
    date: null,
  })),
  // Travel — $12K/month
  ...Array.from({ length: 12 }, (_, i) => ({
    department: "101",
    category: "Travel",
    scenario: "Planned Spend",
    amount: 12000,
    date: null,
  })),
  // Contract — $8.5K/month
  ...Array.from({ length: 12 }, (_, i) => ({
    department: "101",
    category: "Contract",
    scenario: "Planned Spend",
    amount: 8500,
    date: null,
  })),
  // Office — $2K/month
  ...Array.from({ length: 12 }, (_, i) => ({
    department: "101",
    category: "Office",
    scenario: "Planned Spend",
    amount: 2000,
    date: null,
  })),
]

// Simpler budget structure for processing — annual flat amounts per scenario per category
export const mockBudgetFlat = [
  // Planned Spend
  { department: "101", category: "Computers", scenario: "Planned Spend", monthlyAmount: 55000 },
  { department: "101", category: "Software",  scenario: "Planned Spend", monthlyAmount: 22000 },
  { department: "101", category: "Travel",    scenario: "Planned Spend", monthlyAmount: 12000 },
  { department: "101", category: "Contract",  scenario: "Planned Spend", monthlyAmount: 8500  },
  { department: "101", category: "Office",    scenario: "Planned Spend", monthlyAmount: 2000  },

  // Annual Plan (slightly different allocations)
  { department: "101", category: "Computers", scenario: "Annual Plan", monthlyAmount: 62000 },
  { department: "101", category: "Software",  scenario: "Annual Plan", monthlyAmount: 25000 },
  { department: "101", category: "Travel",    scenario: "Annual Plan", monthlyAmount: 10000 },
  { department: "101", category: "Contract",  scenario: "Annual Plan", monthlyAmount: 7000  },
  { department: "101", category: "Office",    scenario: "Annual Plan", monthlyAmount: 1800  },

  // Conservative
  { department: "101", category: "Computers", scenario: "Conservative", monthlyAmount: 45000 },
  { department: "101", category: "Software",  scenario: "Conservative", monthlyAmount: 18000 },
  { department: "101", category: "Travel",    scenario: "Conservative", monthlyAmount: 9000  },
  { department: "101", category: "Contract",  scenario: "Conservative", monthlyAmount: 6000  },
  { department: "101", category: "Office",    scenario: "Conservative", monthlyAmount: 1500  },
]

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
  },
]

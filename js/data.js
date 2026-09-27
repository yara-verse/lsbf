// Default term data. Edits made in the app are saved in the browser and
// override this; "Reset to original data" in Manage restores it.
window.LSBF_DATA = {
  term: "Autumn 2026",
  courses: {
    gei: { name: "Global Entrepreneurship and Innovation", short: "Entrepreneurship", lecturer: "Dr Jeffrey", color: "--c1" },
    dgb: { name: "Dynamic Global Business and Practices", short: "Global Business", lecturer: "Dr Albert", color: "--c2" },
    eth: { name: "Ethics and Global Corporate Citizenship", short: "Ethics", lecturer: "Dr Roy", color: "--c3" },
    ida: { name: "International Data Analytics", short: "Data Analytics", lecturer: "Dr Brian", color: "--c4" }
  },
  items: [
    { id: "gei-diary", c: "gei", date: "2026-11-17", title: "Learning diary", weight: 30, length: "1,000 words", pass: "50%" },
    { id: "dgb-poster", c: "dgb", date: "2026-11-20", title: "Mind-map poster and group presentation", weight: 40, length: "A1 hard copy" },
    { id: "eth-essay", c: "eth", date: "2026-11-26", title: "Individual essay", weight: 60, length: "2,000 words, excl. references" },
    { id: "ida-pres", c: "ida", date: "2026-11-27", title: "Group presentation", weight: 50, length: "2,000 words", pass: "50%",
      flag: "Moodle says Wednesday, but 27 Nov is a Friday. Check with Dr Brian." },
    { id: "eth-quiz", c: "eth", date: "2026-12-01", title: "Individual quiz", weight: 40, length: "Multiple choice", flag: "Date to be confirmed" },
    { id: "ida-case", c: "ida", date: "2026-12-04", title: "Case study report", weight: 50, pass: "50%", time: "3:00 PM" },
    { id: "gei-report", c: "gei", date: "2026-12-08", title: "Individual report", weight: 70, length: "2,000 words", pass: "50%" },
    { id: "dgb-report", c: "dgb", date: "2026-12-11", title: "Individual report", weight: 60, length: "1,000 words" }
  ]
};

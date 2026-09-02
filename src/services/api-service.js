const fakeUser = {
  name: "Test User",
  major: "Computer Science",
  year: "3",
};

const fakeRecommendations = [
  {
    text: "Visit UTM Exam Schedule",
    url: "https://metis.utm.utoronto.ca/examschedule/finalexams.php",
  },
  {
    text: "Visit UTM Academic Advising",
    url: "https://www.utm.utoronto.ca/math-cs-stats/academic-advising-undergraduate-student-resources",
  },
  {
    text: "Visit UTSG Academic Advising",
    url: "https://www.newcollege.utoronto.ca/registration-advising/academic-advising/",
  },
  {
    text: "Visit UTSC Academic Advising",
    url: "https://www.utsc.utoronto.ca/aacc/academic-advising-study-skills-appointments",
  },
];

const fakeActivities = [
  "Uploaded CSC343 Notes",
  "Joined Database Study Room",
  "Viewed SQL Practice Set",
];

export function getCurrentUser() {
  const user = localStorage.getItem("currentUser");

  if (user) {
    return JSON.parse(user);
  }

  return fakeUser;
}

export function getRecommendations() {
  return fakeRecommendations;
}

export function getActivities() {
  return fakeActivities;
}

export function logout() {
  localStorage.removeItem("currentUser");
}

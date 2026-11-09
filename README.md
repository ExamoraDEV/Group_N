# Group_N
IAD project

# Examora -- Online Examination Conducting & Digital Answer Capture Platform

Examora is a role-based web application designed to support university
examination activities for **Students, Lecturers, and Administrators**.

## Live Application

-   **Frontend:** https://examoradev.github.io/Group_N/
-   **Backend API:** https://examora-backend-n3yu.onrender.com/
-   **GitHub Repository:** https://github.com/ExamoraDEV/Group_N

The backend root endpoint should display:

``` text
University Exam Platform API is running!
```

> **Hosting note:** The frontend is hosted on GitHub Pages, the Express
> API is hosted on Render, and application data is stored in MongoDB
> Atlas. The free Render service may sleep after inactivity, so the
> first request can take longer while it starts.

------------------------------------------------------------------------

## Demo Accounts

The following demo account email addresses were supplied for project
demonstration.

  Role            Demo email                   Password
  --------------- --------------------------- ------------------
  Student         `22STD001@university.edu`   1234
  Student         `22STD004@university.edu`   12345678900
  Lecturer        `LEC001@university.edu`     1234
  Lecturer        `LEC004@university.edu`     12345678900
  Administrator   `ADMIN001@university.edu`   12345678     (You can create Student , Lecturer account from Administrator acoount)


## What Each Account Can Do

### 1. Student Portal

Sign in using one of the Student demo email addresses.

Students can:

-   View the student dashboard and examination overview.
-   View examinations for which their account is eligible.
-   Open examination details and read the instructions.
-   Start an available timed examination.
-   Answer supported question types, including:
    -   Multiple-choice questions (MCQ)
    -   True / False questions
    -   Short-answer questions
    -   Essay questions
    -   Bar-chart data questions
-   Navigate between examination questions.
-   Save answers while an attempt is in progress.
-   Flag questions to review before submission.
-   View the remaining time and submit an examination.
-   View submitted-attempt status.
-   View results after the lecturer publishes them.
-   Review personal performance analytics.
-   View and mark notifications as read.
-   View and update permitted profile information.

**Important:** A student can access only examinations for which the
student is eligible. Results are available only after the lecturer
completes the required evaluation and publishes them.

### 2. Lecturer Portal

Sign in using one of the Lecturer demo email addresses.

Lecturers can:

-   View the lecturer dashboard and assessment summaries.
-   Create, view, update, publish, archive, and delete examinations,
    subject to validation and ownership rules.
-   Create and manage reusable questions in the question bank.
-   Work with MCQ, True / False, short-answer, essay, and bar-chart
    question formats.
-   Configure examination duration, schedule, marks, eligible students,
    and attempt settings supported by the application.
-   View the examination schedule and identify scheduling conflicts.
-   View students eligible for their examinations.
-   Monitor examination participation and student attempts.
-   View submitted examination answers.
-   Review and evaluate student submissions.
-   Add marks and feedback where supported by the evaluation workflow.
-   Finalize evaluations.
-   Publish results after all submitted attempts for the examination
    have been finalized.
-   View examination results and performance analytics.
-   View analytics for an individual student associated with their
    examinations.
-   View and manage notifications.
-   View and update permitted lecturer profile information.

**Important:** A lecturer's access is limited to examinations and
associated data owned by that lecturer. The application requires
submitted attempts to be finalized before results can be published.

### 3. Administrator Portal

Sign in using the Administrator demo email address.

Administrators can:

-   View the administrator dashboard.
-   Create student accounts.
-   Create lecturer accounts.
-   View student account records.
-   View lecturer account records.
-   Review account activity information.
-   View deactivated accounts.
-   Deactivate student or lecturer accounts.
-   Reactivate deactivated accounts.

**Important:** Administrator functions are protected by
administrator-role authorization. Use the administrator account only for
account administration and project demonstration.

------------------------------------------------------------------------

## Main Functional Modules

1.  **Authentication and Role-Based Access** -- authenticates users and
    protects student, lecturer, and administrator areas.
2.  **Examination and Question Bank Management** -- allows lecturers to
    create examinations and maintain reusable questions.
3.  **Timed Online Examination and Answer Capture** -- allows eligible
    students to attempt examinations, save answers, flag questions, and
    submit within the configured time.
4.  **Answer Evaluation and Lecturer Marking** -- supports evaluation of
    submitted answers and lecturer review/finalization.
5.  **Results and Performance Analytics** -- supports result publication
    and student/lecturer performance views.
6.  **Account Administration and Notifications** -- supports
    administrator account operations and role-specific notifications.

------------------------------------------------------------------------

## Technology Stack

  -----------------------------------------------------------------------
  Layer                               Technologies
  ----------------------------------- -----------------------------------
  Frontend                            React, React Router, Vite, CSS

  Backend                             Node.js, Express.js

  Database                            MongoDB Atlas, Mongoose

  Authentication                      JSON Web Token (JWT), bcryptjs,
                                      HTTP-only session cookie

  API                                 REST API

  Charts / Analytics                  Recharts and project analytics
                                      services

  Version Control                     Git and GitHub

  Frontend Hosting                    GitHub Pages

  Backend Hosting                     Render
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## Local Installation and Setup

### Prerequisites

-   Git
-   Node.js and npm
-   MongoDB Atlas database access
-   Visual Studio Code or another code editor

### 1. Clone the repository

``` bash
git clone https://github.com/ExamoraDEV/Group_N.git
cd Group_N
```

### 2. Configure and run the backend

``` bash
cd university-exam-platform/server
npm install
```

Create a local `.env` file using the project's environment-variable
example or the configuration supplied by the project team. Configure the
required values:

  -----------------------------------------------------------------------
  Variable                            Purpose
  ----------------------------------- -----------------------------------
  `PORT`                              Local backend port; defaults to
                                      `5000` if not supplied

  `NODE_ENV`                          Runtime environment; use
                                      `development` locally

  `MONGODB_URI`                       MongoDB Atlas connection string

  `JWT_SECRET`                        Private JWT signing secret (at
                                      least 32 characters)

  `CLIENT_ORIGIN`                     Frontend origin allowed by backend
                                      CORS

  `STUDENT_EMAIL_REGEX`               Student email validation pattern,
                                      if configured

  `LECTURER_EMAIL_REGEX`              Lecturer email validation pattern,
                                      if configured
  -----------------------------------------------------------------------

Start the backend development server:

``` bash
npm run dev
```

The backend package also defines:

``` bash
npm start
npm test
```

-   `npm start` starts the production server.
-   `npm test` runs the backend Node.js test suite.

### 3. Configure and run the frontend

Open a second terminal from the repository root:

``` bash
cd university-exam-platform/client
npm install
```

Configure the frontend API base URL for local development:

``` env
VITE_API_BASE_URL=http://localhost:5000
```

Start the Vite development server:

``` bash
npm run dev
```

Open the local URL printed by Vite in the terminal.

------------------------------------------------------------------------

## Deployment Information

### Frontend -- GitHub Pages

-   Hosted at: https://examoradev.github.io/Group_N/
-   Build tool: Vite.
-   The GitHub Actions workflow builds the frontend from
    `university-exam-platform/client`.
-   The workflow uses the GitHub repository variable `VITE_API_BASE_URL`
    during the production build.
-   The generated `dist` folder is deployed to GitHub Pages.

### Backend -- Render

-   Hosted at: https://examora-backend-n3yu.onrender.com/
-   Runtime: Node.js.
-   Start command: `npm start`.
-   The backend reads its database URI, JWT secret, CORS origin, and
    other configuration from Render environment variables.
-   Render supplies the listening `PORT`.

### Database -- MongoDB Atlas

-   MongoDB Atlas provides the hosted database.
-   The backend connects using the private `MONGODB_URI` environment
    variable.
-   Database credentials must never be committed to the repository.

------------------------------------------------------------------------

## Security Notes

-   Never upload `.env` files to GitHub.
-   Never publish passwords, JWT secrets, MongoDB connection strings, or
    private API credentials.
-   Use only designated demo accounts for assessment.
-   Change demo passwords if they have been exposed.
-   Do not use the demo accounts for personal or production data.
-   The platform is an academic project and should be security-tested
    before any high-stakes institutional use.

------------------------------------------------------------------------

## Known Deployment Consideration

The frontend and backend are hosted on different domains. The production
application therefore depends on correct CORS configuration and
credentialed browser requests for cookie-based authentication. If
sign-in remains on a loading state, inspect the browser Network tab and
Render logs and verify the login response, cookie acceptance, and
`/api/auth/me` request.

------------------------------------------------------------------------

## Project Repository

Source code and deployment workflow:

https://github.com/ExamoraDEV/Group_N

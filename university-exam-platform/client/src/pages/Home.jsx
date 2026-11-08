
import { Link } from "react-router-dom";

function Home() {
  const features = [
    {
      icon: "01",
      title: "Exam Management",
      description:
        "Create question papers, manage question banks, and schedule examinations with ease.",
      className: "feature-blue",
    },
    {
      icon: "02",
      title: "Timed Online Exams",
      description:
        "Let students complete examinations with a countdown timer and answer-saving support.",
      className: "feature-purple",
    },
    {
      icon: "03",
      title: "Smart Assessment",
      description:
        "Automatically grade MCQs and support marking of essay and diagram answers.",
      className: "feature-green",
    },
    {
      icon: "04",
      title: "Results & Analytics",
      description:
        "Track student performance and identify areas that need improvement.",
      className: "feature-orange",
    },
  ];

  return (
    <main>
      {/* HERO SECTION */}
      <section className="hero-section" id="home">
        <img
          className="hero-background"
          src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=2000&q=85"
          alt="University students studying together"
        />

        <div className="hero-overlay"></div>

        <div className="container hero-inner">
          <div className="hero-copy">
            <span className="hero-badge">
              <span className="badge-dot"></span>
              SMARTER ONLINE EXAMINATIONS
            </span>

            <h1>
              Take Exams.
              <br />
              Track Progress.
              <br />
              <span>Build Your Future.</span>
            </h1>

            <p>
              Experience a smarter way to conduct examinations,
              assess knowledge, and follow academic progress.
              Everything you need, in one platform.
            </p>


            <div className="hero-buttons">
              <Link className="button button-primary" to="/signin">
                Sign In <span>→</span>
              </Link>
            </div>


            <div className="hero-caption">
              <span className="caption-check">✓</span>
              Designed for university lecturers and students
            </div>
          </div>

          <div className="hero-preview">
            <div className="preview-heading">
              <div>
                <span className="mini-label">EXAMORA PREVIEW</span>
                <h3>Online Examination</h3>
              </div>
              <span className="preview-status">DEMO</span>
            </div>

            <div className="preview-timer">
              <div className="timer-icon">◷</div>
              <div>
                <span className="mini-label">TIME REMAINING</span>
                <strong>00 : 45 : 30</strong>
              </div>
            </div>

            <div className="preview-progress">
              <div>
                <span>Question 01</span>
                <span>1 of 20</span>
              </div>
              <div className="progress-line">
                <span></span>
              </div>
            </div>

            <h4>
              Which technology is commonly used to build
              interactive user interfaces?
            </h4>

            <div className="preview-answer selected-answer">
              <span>A</span>
              <p>React.js</p>
              <b>✓</b>
            </div>

            <div className="preview-answer">
              <span>B</span>
              <p>Microsoft Word</p>
            </div>

            <div className="preview-answer">
              <span>C</span>
              <p>Adobe Reader</p>
            </div>

            <div className="preview-footer">
              <span>● Sample interface</span>
              <span>Examora</span>
            </div>
          </div>

          <div className="hero-floating">
            <div className="floating-symbol">✓</div>
            <div>
              <strong>One platform</strong>
              <span>Exams, marking & results</span>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT SECTION */}
      <section className="about-section container" id="about">
        <div className="about-visual">
          <div className="about-ring"></div>

          <img
            src="https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?auto=format&fit=crop&w=900&q=85"
            alt="Students at a university campus"
            className="about-image"
            loading="lazy"
          />

          <div className="about-floating">
            <span>✓</span>
            <div>
              <strong>Learn. Assess. Improve.</strong>
              <small>Built around your progress</small>
            </div>
          </div>
        </div>

        <div className="about-content">
          <span className="section-eyebrow">ABOUT OUR PLATFORM</span>

          <h2>
            Where education meets technology to create better
            examination experiences.
          </h2>

          <p className="about-description">
            Examora brings exam creation, online assessment,
            answer marking, and performance tracking together
            in one digital platform for university education.
          </p>

          <div className="benefit-list">
            <div className="benefit-item">
              <span className="benefit-icon">✓</span>
              <div>
                <h3>Interactive Online Examinations</h3>
                <p>
                  Attempt MCQs, type written answers, and prepare
                  diagram responses online.
                </p>
              </div>
            </div>

            <div className="benefit-item">
              <span className="benefit-icon">✓</span>
              <div>
                <h3>Efficient Assessment</h3>
                <p>
                  Support automatic MCQ grading and lecturer-led
                  marking for other answer types.
                </p>
              </div>
            </div>

            <div className="benefit-item">
              <span className="benefit-icon">✓</span>
              <div>
                <h3>Performance Insights</h3>
                <p>
                  Bring results and academic progress into one
                  convenient place.
                </p>
              </div>
            </div>
          </div>

          <Link to="/features" className="text-link">
            Explore our features <span>→</span>
          </Link>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="features-section" id="features">
        <div className="container">
          <div className="section-heading">
            <span className="section-eyebrow">WHY EXAMORA?</span>
            <h2>Everything you need for smarter exams.</h2>
            <p>
              A unified platform designed to make examinations
              simpler for lecturers and students.
            </p>
          </div>

          <div className="features-grid">
            {features.map((feature) => (
              <article className="feature-card" key={feature.icon}>
                <div className={`feature-icon ${feature.className}`}>
                  {feature.icon}
                </div>

                <h3>{feature.title}</h3>

                <p>{feature.description}</p>

                <Link to="/features" className="feature-link">
                  Learn more <span>→</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* WORKFLOW SECTION */}
      <section className="workflow-section container" id="how-it-works">
        <div className="section-heading">
          <span className="section-eyebrow">HOW IT WORKS</span>
          <h2>Four steps to a better exam experience.</h2>
        </div>

        <div className="workflow-grid">
          <article>
            <span>01</span>
            <h3>Create</h3>
            <p>Lecturers prepare questions and schedule exams.</p>
          </article>

          <article>
            <span>02</span>
            <h3>Attempt</h3>
            <p>Students answer questions within the time limit.</p>
          </article>

          <article>
            <span>03</span>
            <h3>Evaluate</h3>
            <p>MCQs are graded and written answers are marked.</p>
          </article>

          <article>
            <span>04</span>
            <h3>Improve</h3>
            <p>Results help users understand academic progress.</p>
          </article>
        </div>
      </section>

      {/* GET STARTED SECTION */}
      <section className="get-started-section container" id="get-started">
        <div>
          <span className="section-eyebrow">YOUR NEXT STEP</span>
          <h2>Ready to experience Examora?</h2>
          <p>
            A smarter examination experience starts here.
          </p>
        </div>

        <a
          className="button button-light"
          href="#home"
          onClick={(e) => {
            e.preventDefault();

            document.getElementById("home")?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }}
        >
          Explore the Platform <span>→</span>
        </a>
      </section>
    </main>
  );
}

export default Home;

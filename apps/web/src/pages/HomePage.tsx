import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import heading from "../assets/heading.svg";
import heroArt from "../assets/hero.svg";
import { QuestionCard } from "../components/QuestionCard";
import { useFeaturedQuestions } from "../questions";
import { usePageTitle } from "../title";

const STEPS = [
  {
    title: "Pick a question",
    text: "Every topic is phrased as a real question you can answer: For, Neutral or Against.",
  },
  {
    title: "Read every side",
    text: "The strongest posts on each side sit next to each other, ranked by how many people they helped understand.",
  },
  {
    title: "Challenge, don't shout",
    text: "Disagree with a post? Open a challenge. Debate lives in its own thread, so the reasoning stays readable.",
  },
];

const PRINCIPLES = [
  {
    title: "Reasoning before reactions",
    text: "Posts explain why, not just what. There are no downvotes, only “this helped me understand”.",
  },
  {
    title: "Credit for crossing sides",
    text: "A helpful vote from someone on the other side counts three times as much as one from your own.",
  },
  {
    title: "Debate has a place",
    text: "Arguments happen inside challenges, never under every post, so the main page stays calm.",
  },
];

export function HomePage() {
  usePageTitle(null);
  const { hash } = useLocation();

  // Links like "/#how" from other pages land at the right section.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <>
      <section className="hero">
        <img className="hero-art" src={heroArt} alt="" />
        <div className="hero-copy">
          <h1 className="hero-heading">
            <img src={heading} alt="Before you take a side, see every side" />
          </h1>
          <p className="hero-lead">
            Every question is split into For, Neutral and Against. Read the best
            reasoning on each side first; debate happens only inside challenges.
          </p>
          <div className="hero-actions">
            <Link to="/questions" className="button hero-button">
              Explore questions
            </Link>
            <Link to="/ask" className="button button-outline hero-button">
              Ask a question
            </Link>
          </div>
        </div>
      </section>

      <section id="how" className="landing-section">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">How it works</p>
            <h2>Understand first. Argue later.</h2>
          </div>
          <ol className="steps">
            {STEPS.map((step, index) => (
              <li key={step.title} className="step">
                <span className="step-number" aria-hidden="true">
                  {index + 1}
                </span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <FeaturedQuestions />

      <section className="landing-section">
        <div className="container principles">
          <div className="section-heading">
            <p className="eyebrow">Why Perspective</p>
            <h2>Built to reward understanding, not volume.</h2>
          </div>
          <ul className="principle-list">
            {PRINCIPLES.map((principle) => (
              <li key={principle.title}>
                <svg
                  aria-hidden="true"
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <div>
                  <h3>{principle.title}</h3>
                  <p>{principle.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="cta-section">
        <div className="container cta">
          <div>
            <h2>Have a question worth splitting?</h2>
            <p>
              Ask it, say where you stand, and let every side make its case.
            </p>
          </div>
          <Link to="/ask" className="button button-light">
            Ask a question
          </Link>
        </div>
      </section>
    </>
  );
}

function FeaturedQuestions() {
  const featured = useFeaturedQuestions();
  const questions = featured.data?.questions ?? [];

  return (
    <section className="landing-section landing-section-alt">
      <div className="container">
        <div className="section-heading section-heading-row">
          <div>
            <p className="eyebrow">Active now</p>
            <h2>Questions people are weighing</h2>
          </div>
          <Link to="/questions" className="text-link">
            Browse all questions
          </Link>
        </div>
        {featured.isPending && <p className="muted">Loading questions…</p>}
        {featured.isError && (
          <p className="form-error">Couldn't load questions.</p>
        )}
        {featured.isSuccess && questions.length === 0 && (
          <p className="empty">
            No questions yet. <Link to="/ask">Ask the first one.</Link>
          </p>
        )}
        <ul className="question-tiles">
          {questions.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              variant="tile"
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

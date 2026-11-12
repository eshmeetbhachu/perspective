import { Link } from "react-router";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <Link to="/" className="brand">
            Perspective
          </Link>
          <p>Before you take a side, see every side.</p>
        </div>
        <nav aria-label="Footer" className="footer-links">
          <div>
            <h2>Explore</h2>
            <Link to="/questions">All questions</Link>
            <Link to="/ask">Ask a question</Link>
            <Link to="/#how">How it works</Link>
          </div>
          <div>
            <h2>Project</h2>
            <a href="https://github.com/eshmeetbhachu/perspective">
              Source on GitHub
            </a>
          </div>
        </nav>
      </div>
      <p className="footer-legal">
        © {new Date().getFullYear()} Perspective · Built by Eshmeet Singh Bhachu
      </p>
    </footer>
  );
}

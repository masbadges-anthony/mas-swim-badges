import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="mas-error">
      <div className="mas-error-card">
        <p className="mas-error-eyebrow">Error · Not found</p>
        <div className="mas-error-code">404</div>
        <h1 className="mas-error-title">This page wandered off</h1>
        <p className="mas-error-text">
          The link may be outdated, or the page might have been moved or removed.
          Head back home to get back on track.
        </p>
        <div className="mas-error-actions">
          <Link to="/" className="mas-btn-primary"><Icon name="home" /> Back to home</Link>
          <button className="mas-btn-secondary" onClick={() => navigate(-1)}>
            <Icon name="arrowLeft" /> Go back
          </button>
        </div>
        <div className="mas-error-meta"><b>STATUS</b> 404 &nbsp; <b>CODE</b> NOT_FOUND</div>
      </div>
    </div>
  );
}

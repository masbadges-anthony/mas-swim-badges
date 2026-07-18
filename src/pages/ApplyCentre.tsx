// Legacy: this page originally attempted a direct client-side insert into
// partner_centers, which the current RLS policy blocks (only chairperson /
// board_member can INSERT). The correct path for a random visitor is now
// /apply-partner-centre, which submits an enquiry that gets reviewed and
// converted into an application. This file redirects to that.
//
// If you are a MAS-certified instructor registering the centre you teach at,
// use /centres/register instead — that's the authenticated instructor flow
// via the register_centre RPC.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ApplyCentre() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/apply-partner-centre', { replace: true });
  }, [navigate]);
  return null;
}

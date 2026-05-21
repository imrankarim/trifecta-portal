# Project Trifecta — EO Dallas Board Portal

Interactive board portal mockup for EO Dallas chapter operations. Built as a single self-contained HTML file — no build step, no dependencies, no server required.

## Live demo

Hosted via GitHub Pages: `https://<your-username>.github.io/<repo-name>/`

## Roles in the demo

Use the **Demo Mode** bar at the top to switch between board chair views:

| Role | Owner | Primary focus |
|---|---|---|
| Executive Director | Jon Minjoe | Renewals pipeline, communications, chapter health |
| President | Gail Davis | Board actions, chapter overview |
| Membership | Imran Karim | Prospect pipeline, at-risk members |
| Engagement | Matt Newton | Events, attendance, member activity |
| Forum Officer | Morgan Katz | Forum health, session tracking |
| SAP | Ellen Hunter | Sponsorship deals, partner pipeline |
| SLP | Julia Magann | Learning programs |
| Elumni Chair | TBD | Alumni re-engagement program |

## Deploying to GitHub Pages

1. Create a new GitHub repository (public or private — Pages works on both with the right plan)
2. Upload all files in this folder to the repository root
3. Go to **Settings → Pages**
4. Under *Source*, select **Deploy from a branch**
5. Choose `main` branch, `/ (root)` folder, and click Save
6. Your site will be live at `https://<your-username>.github.io/<repo-name>/` within 1–2 minutes

## Files

- `index.html` — the board portal (single file, fully self-contained)
- `.nojekyll` — tells GitHub Pages not to run Jekyll processing
- `README.md` — this file

## Notes

- All data shown is a mockup using real EO Dallas member and prospect names pulled from HubSpot for demo accuracy
- No backend — switching roles and views is handled entirely in JavaScript
- Fonts load from Google Fonts CDN (requires internet connection)

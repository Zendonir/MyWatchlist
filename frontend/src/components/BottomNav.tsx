import { NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Watchlist", icon: "\u{1F4FA}" },
  { to: "/search", label: "Suche", icon: "\u{1F50D}" },
  { to: "/settings", label: "Einstellungen", icon: "⚙️" },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) => "bottom-nav__item" + (isActive ? " bottom-nav__item--active" : "")}
        >
          <span className="bottom-nav__icon">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

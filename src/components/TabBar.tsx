import { NavLink } from 'react-router-dom';
import { Icon } from './Icon';

export function TabBar() {
  const cls = ({ isActive }: { isActive: boolean }) => `tab ${isActive ? 'active' : ''}`;
  return (
    <nav className="tabbar" aria-label="Main">
      <NavLink to="/" end viewTransition className={cls}>
        <Icon name="car" />
        <span>Garage</span>
      </NavLink>
      <NavLink to="/history" viewTransition className={cls}>
        <Icon name="history" />
        <span>History</span>
      </NavLink>
      <NavLink to="/log" viewTransition className="tab tab-add" aria-label="Log a cost">
        <span className="tab-add-button">
          <Icon name="plus" size={26} strokeWidth={2.4} />
        </span>
      </NavLink>
      <NavLink to="/reminders" viewTransition className={cls}>
        <Icon name="bell" />
        <span>Reminders</span>
      </NavLink>
      <NavLink to="/settings" viewTransition className={cls}>
        <Icon name="gear" />
        <span>Settings</span>
      </NavLink>
    </nav>
  );
}

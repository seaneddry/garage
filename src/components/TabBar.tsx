import { NavLink } from 'react-router-dom';
import { Icon } from './Icon';

/** Floating glass capsule with the four main screens. Costs are logged from "+ Log" on Garage. */
export function TabBar() {
  const cls = ({ isActive }: { isActive: boolean }) => `tab ${isActive ? 'active' : ''}`;
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tab-capsule">
        <NavLink to="/" end viewTransition className={cls}>
          <Icon name="car" />
          <span>Garage</span>
        </NavLink>
        <NavLink to="/history" viewTransition className={cls}>
          <Icon name="history" />
          <span>History</span>
        </NavLink>
        <NavLink to="/reminders" viewTransition className={cls}>
          <Icon name="bell" />
          <span>Reminders</span>
        </NavLink>
        <NavLink to="/settings" viewTransition className={cls}>
          <Icon name="gear" />
          <span>Settings</span>
        </NavLink>
      </div>
    </nav>
  );
}

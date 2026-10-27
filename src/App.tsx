import { Navigate, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { useAuth } from './auth';
import { TabBar } from './components/TabBar';
import { VehicleProvider } from './lib/vehicle';
import { Garage } from './screens/Garage';
import { History } from './screens/History';
import { EntryForm } from './screens/EntryForm';
import { Reminders } from './screens/Reminders';
import { ReminderForm } from './screens/ReminderForm';
import { Settings } from './screens/Settings';
import { CarForm } from './screens/CarForm';
import { Odometer } from './screens/Odometer';
import { Login } from './screens/Login';
import { Workshops } from './screens/Workshops';
import { WorkshopForm } from './screens/WorkshopForm';
import { Book } from './screens/Book';
import { Notifications } from './screens/Notifications';

function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return (
    <VehicleProvider>
      <Outlet />
    </VehicleProvider>
  );
}

function Shell() {
  return (
    <>
      <Outlet />
      <TabBar />
    </>
  );
}

const router = createBrowserRouter(
  [
    { path: '/login', element: <Login /> },
    {
      element: <RequireAuth />,
      children: [
        {
          element: <Shell />,
          children: [
            { path: '/', element: <Garage /> },
            { path: '/history', element: <History /> },
            { path: '/reminders', element: <Reminders /> },
            { path: '/settings', element: <Settings /> },
          ],
        },
        { path: '/log', element: <EntryForm /> },
        { path: '/entry/:id', element: <EntryForm /> },
        { path: '/link/:transactionId', element: <EntryForm /> },
        { path: '/reminders/new', element: <ReminderForm /> },
        { path: '/reminders/:id', element: <ReminderForm /> },
        { path: '/settings/car/:id', element: <CarForm /> },
        { path: '/odometer', element: <Odometer /> },
        { path: '/workshops', element: <Workshops /> },
        { path: '/workshops/:id', element: <WorkshopForm /> },
        { path: '/book', element: <Book /> },
        { path: '/settings/notifications', element: <Notifications /> },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
);

export function App() {
  return <RouterProvider router={router} />;
}

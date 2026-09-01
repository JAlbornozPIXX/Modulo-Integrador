import { createBrowserRouter, Outlet,} from "react-router-dom";
import SignUp from "./modules/auth/pages/guest/SignUp";
import SignIn from "./modules/auth/pages/guest/SignIn";
import ResetPassword from "./modules/auth/pages/guest/ResetPassword";
import ForgotPassword from "./modules/auth/pages/guest/ForgotPassword";



const Home = () => {
    return (
        <div>
            <h1>Rody vamos por un cafe po ermano</h1>
        </div>
    );
}

const Application = () => {
    return (
        <div>
            <Outlet />
        </div>
    );
}

const router = createBrowserRouter([
    {
        path: "/",
        element: <Application />,
        children: [
            {
                index: true,
                element: <Home />,
            },

            {
                path: "/auth/sign-up",
                element: <SignUp />,
            },

            {
                path: "/auth/sign-in",
                element: <SignIn />,
            },

            {
                path: "/auth/reset-password",
                element: <ResetPassword />,
            },

            {
                path: "/auth/forgot-password",
                element: <ForgotPassword />,
            }



        ]
    },
]);

export default router;
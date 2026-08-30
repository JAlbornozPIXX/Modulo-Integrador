import { createBrowserRouter, Outlet,} from "react-router-dom";
import SignUp from "./modules/auth/pages/guest/SignUp";

const Home = () => {
    return (
        <div>
            <h1>hello world</h1>
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
            }
        ]
    },
]);

export default router;
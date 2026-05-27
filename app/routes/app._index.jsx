import { redirect } from "react-router";

export async function loader({ request }) {
  const url = new URL(request.url);

  return redirect(`/app/collections${url.search}`);
}
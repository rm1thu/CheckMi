import { Href, Redirect } from "expo-router";

export default function Index() {
  return <Redirect href={"/welcome" as Href} />;
}

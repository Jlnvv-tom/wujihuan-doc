import { guideSidebar } from "./guide";
import { computerSidebar } from "./computer";
import { inspirationSidebar } from "./inspiration";
import { englishSidebar } from "./english";
import {
  javascriptSidebar,
  html5Sidebar,
  nodeSidebar,
  css3Sidebar,
  axiosSidebar,
  vueSidebar,
  fastapiSidebar,
  reactSidebar,
  golangSidebar,
  pythonSidebar,
  mysqlSidebar,
} from "./handbook";

const mySideBar = {
  "/guide/": guideSidebar,
  "/computer/": computerSidebar,
  "/inspiration/": inspirationSidebar,
  "/handbook/javascript/": javascriptSidebar,
  "/handbook/react/": reactSidebar,
  "/handbook/fastapi/": fastapiSidebar,
  "/handbook/golang/": golangSidebar,
  "/handbook/mysql/": mysqlSidebar,
  "/handbook/python/": pythonSidebar,
  "/handbook/html5/": html5Sidebar,
  "/handbook/node/": nodeSidebar,
  "/handbook/css3/": css3Sidebar,
  "/handbook/axios/": axiosSidebar,
  "/handbook/vue/": vueSidebar,
  "/english/": englishSidebar,
};

export default mySideBar;

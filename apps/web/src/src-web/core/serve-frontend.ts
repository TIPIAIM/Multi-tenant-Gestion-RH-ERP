import express, {type Express} from "express";
import {existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {extname,resolve} from "node:path";

/** À appeler après les routes API et avant notFoundMiddleware. */
export function serveFrontend(app:Express):void {
 if(process.env.NODE_ENV!=="production")return;
 const directory=process.env.FRONTEND_DIST_DIR
  ?resolve(process.env.FRONTEND_DIST_DIR)
  :fileURLToPath(new URL("../../../web/dist/",import.meta.url));
 const index=resolve(directory,"index.html");
 if(!existsSync(index))throw new Error("Frontend absent : compiler apps/web avant de démarrer l’API.");
 const staticFiles=express.static(directory,{index:false,maxAge:0});
 app.use((request,response,next)=>{
  if(request.path==="/api"||request.path.startsWith("/api/"))return next();
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:; font-src 'self' data:; object-src 'none'; frame-src 'self' blob: https:; base-uri 'self'; frame-ancestors 'self'; form-action 'self'");
  staticFiles(request,response,next);
 });
 app.get("/{*page}",(request,response,next)=>{
  if(request.path==="/api"||request.path.startsWith("/api/")||extname(request.path)||!request.accepts("html"))return next();
  response.setHeader("Cache-Control","no-cache");
  response.sendFile(index);
 });
}

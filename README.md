# Angular in Docker with Nginx, supporting environments, built with multi-stage Docker builds

Here's how to deploy an [Angular](https://angular.io/) app with [Docker](https://www.docker.com/), building it with [Node.js](https://nodejs.org) as you would do locally, but end up with a thin and efficient [Nginx](https://nginx.org/) image, with just the compiled code. Ready for production.

To achieve that, you can use [Docker "multi-stage builds"](https://docs.docker.com/engine/userguide/eng-image/multistage-build/). That will allow you to first build your Angular app inside a (possibly huge) Node JS Docker container that is later discarded in favor of a thin Nginx image with just your compiled app. And your final image will be as thin as the latest layer (Nginx).

Here you will also see how to use that technique but still support [Angular CLI](https://github.com/angular/angular-cli) [environments](https://github.com/angular/angular-cli/wiki/build#build-targets-and-environment-files).

All this removes the need for complex building scripts or the need to add your built app to git (your `dist` directory).

This could also be adapted to any compiled front end framework like [React](https://reactjs.org/). But the main tricks you need are all below.

## TL;DR:

* Create a new Angular project, e.g. "my-angular-project":

```bash
ng new my-angular-project
```

* Enter into your project directory:

```bash
cd my-angular-project
```

* Add a Nginx configuration inside your project directory, named `nginx-custom.conf`, with:

```nginx
server {
  listen 80;
  location / {
    root /usr/share/nginx/html;
    index index.html index.htm;
    try_files $uri $uri/ /index.html =404;
  }
}
```

* Add a `.dockerignore` for `node_modules` with:

```
node_modules
```



* Add a `Dockerfile` in your directory with:

```Dockerfile
# Stage 0, based on Node.js, to build and compile Angular
FROM node:8.6 as node

WORKDIR /app

COPY package.json /app/

RUN npm install

COPY ./ /app/

ARG env=prod

RUN npm run build -- --prod --environment $env


# Stage 1, based on Nginx, to have only the compiled app, ready for production with Nginx
FROM nginx:1.13

COPY --from=node /app/dist/ /usr/share/nginx/html

COPY ./nginx-custom.conf /etc/nginx/conf.d/default.conf
```

* Build your image using the production environment, e.g.:

```bash
docker build -t my-angular-project:prod .
```

* Build your image using the development environment, e.g.:

```bash
docker build -t my-angular-project:dev --build-arg env=dev .
```

* Test your image for the production environment with:

```bash
docker run -p 80:80 my-angular-project:prod
```

* Open your browser in <http://localhost>.

* Test your image for the development environment with:

```bash
docker run -p 80:80 my-angular-project:dev
```

* Open your browser in <http://localhost>.

## Details

*Everything above shows the actual code you need. If you're in a hurry, you could probably just copy all that. If you want to know all the details and possible optimizations, continue reading...*

---

When you build an Angular front-end app, you most commonly write it in [TypeScript](http://www.typescriptlang.org/) and then compile it to JavaScript. But you need to have Node.js and several packages to do that.

After you compile your app, you end up with a set of files, normally in a `./dist` directory. Those are the compiled files that you actually use to serve your app. And those files have all the optimizations that you use, for example, AOT (Ahead Of Time compilation).

And those files are the final product that you serve to your users. Your users don't need your source TypeScript files nor any of the packages you use during development, just the compiled files.

So, you need to deploy to production only those files.

These are the options we have, take them as the "motivation" for what we will do next:

### Option 1:

One way to do it is to compile the app locally and add the compiled files to your Git repository. And then, when you are deploying, you just clone your repository and use those compiled files. As we are talking about Docker, you would create an image that copies and uses those compiled files. Your would probably use an [Nginx base image](https://hub.docker.com/_/nginx/) for that.

But you never edit those compiled files directly, they are generated from your source files. They are constantly changing, so your Git repository will grow large just because you are adding compiled code. And if someone in your team works on a feature branch and has one version of those files and he wants to merge the feature to your main (probalby `master`) branch, you might have conflicts in those files, even when the source code doesn't have conflicts. So you would have to be fixing "virtual" conflicts. There are probably other disadvantages too. So, the compiled files don't really belong to your Git repository.

Also, if you forget to compile and commit everything right before deploying, you'll get an old version of the deployed app.


### Option 2:

Another way to do it would be to do not add your compiled code to your Git repository and build your app every time you are going to deploy.

But this would require all your deployment servers or wherever it is that you build your Docker image to have all the tooling to deploy your app. Node.js, TypeScript, all the Angular packages, all the dependencies, etc.

And again, if you forget to compile everything right before deploying, you'll get an old version of the app deployed.

But all the problems that you would have with dependencies by needing to have all the tooling in a server is what Docker is supposed to solve, right?


### Option 3:

You could build the whole app inside your Docker image, and then serve it from the same image.

That would imply that you would start from an [official Node.js base image](https://hub.docker.com/_/node/) to compile everything and then you would have to setup a server with Node.js or install Nginx manually on top of Node.js (or something similar).

If you install Nginx by hand you lose the option to use the [official Nginx base image](https://hub.docker.com/_/nginx/) that is already fine tuned.

Also, you would end up with huge images that all your deployment servers have to download (if you are concerned about size) and a complex environment, with all the Node.js / Angular packages and dependencies.


### Option 4:

You could write a complex script that builds your app in one Docker image using Node.js, then extract the compiled files, and then build a second image based on Nginx with just your compiled files.

We are getting close, but you would have another complex script to debug. Copying files from a Docker container and to another Docker image, etc. Not that promising...


### Option 5:

Use [Docker multi-stage builds](https://docs.docker.com/engine/userguide/eng-image/multistage-build/). With that, you can have a Node.js base image that installs, builds and compiles everything, and then, "discard" all those Node.js specific Docker image layers, and end up with a Nginx image with just your compiled code.

You would have an efficient Nginx server with great performance for your static final (compiled) files. You wouldn't have to add your compiled code to Git, you always get the latest compiled version of your code, you don't have to deal with dependencies outside Docker, etc.

That's great! Docker multi-stage builds solve several problems in one shot. And this option is what is [described in this article: "Create efficient Angular Docker images with Multi Stage Builds"](https://medium.com/@avatsaev/create-efficient-angular-docker-images-with-multi-stage-builds-907e2be3008d). But...

When building your Angular code with [Angular CLI](https://github.com/angular/angular-cli) you have the option to use ["environments"](https://github.com/angular/angular-cli/wiki/build#build-targets-and-environment-files) while building the Angular app. That alows you to, for example, use a production back end API while using the "`prod`" environment and use a testing back end API while using the "`dev`" environment.

But with just the method described above we would have no way to use that feature.

So, let's create an "**Option 6**" that combines all of the above and lets us use Angular CLI environments.


## Requirements

* [Angular CLI](https://github.com/angular/angular-cli) (you need to have [Node.js](https://nodejs.org) first)

* [Docker](https://www.docker.com/)

## Angular

If you don't know Angular (Angular 2+) yet, go and do [their tutorials](https://angular.io/docs) first.

If you are building an Angular front-end web app, you probably should create your code with [Angular CLI](https://github.com/angular/angular-cli).

That will help you setting everything up, compiling the app with AOT (Ahead Of Time compilation), serving the app during development with auto-reload, etc.

* So, go ahead and install [Angular CLI](https://github.com/angular/angular-cli).

* To create a new Angular project, e.g. "my-angular-project", run:

```bash
ng new my-angular-project
```

* Enter into your project directory:

```bash
cd my-angular-project
```

* To be able to see the differences between the Angular CLI environments in the final app, edit your component code in `src/app/app.component.ts`, import the `environment`:


```TypeScript
import { environment } from '../environments/environment';

...
```

* Then, add that environment's `production` property as a component property, so that you can use it in your template:

```TypeScript
...

export class AppComponent {
  
...

  production = environment.production;
}
```

* Your final code might look like:

```TypeScript
import { Component } from '@angular/core';

import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'app';

  production = environment.production;
}
```

* Then, edit your template to show your `production` value, for example, add the following:

```html
...

<h2 *ngIf="production">We are running in production!</h2>
<h2 *ngIf="!production">We are running in development...</h2>

...
```

* Your final template might look like:

```html
<div style="text-align:center">
  <h1>
Welcome to {{title}}!
  </h1>
  <h2 *ngIf="production">We are running in production!</h2>
  <h2 *ngIf="!production">We are running in development...</h2>
</div>
```

**Note**: I'm omitting some of the default Angular CLI code for brevity.

* Now, if you run your code locally with the defaults, e.g.:

```bash
ng serve
```

* And open your browser in <http://localhost:4200>

...you will see your code using the `dev` environment. So you might probably see something like:


<img src="./readme-assets/01.png">

* But if you run it passing the `--prod` flag (or the more specific `--environment prod`), e.g.:

```bash
ng server --prod
```

* And open your browser in <http://localhost:4200>

...you will probably see something like:

<img src="./readme-assets/02.png">

*notice the "`running in production!`"*.

* To learn more about Angular CLI environments, check [the official Angular CLI documentation](https://github.com/angular/angular-cli/wiki/build#build-targets-and-environment-files).

This is a bare-bones Angular project. Just the basic parts to show the point. There are many ways to improve Angular using modules, etc. But we'll just stick to the basics for now.


## Nginx

Nowadays, Nginx is more or less the "de facto standard" for static content serving. You can search about it and read about its performance. The web is full of articles about it.

So, for our final Docker image, we will need to have a Nginx configuration. You don't really need to know much more about it for now. As the official Docker image will do all the heavy lifting for you.

But we do need to create a basic config file that we'll use later.

* Add a Nginx configuration inside your project directory, named `nginx-custom.conf`, with:

```nginx
server {
  listen 80;
  location / {
    root /usr/share/nginx/html;
    index index.html index.htm;
    try_files $uri $uri/ /index.html =404;
  }
}
```

* The most important part is the:

```nginx
try_files $uri $uri/ /index.html =404;
```

...that tells Nginx to try to match the files it is requested in the URL (URI) with files it has available. That will make it, for example, match the `/main.bundle.js` and return the JavaScript file. But when there's no match, it will default to `index.html`.

That will make it return the `index.html` for any other URL it receives, so, all the Angular router URLs will work, even when going to the URL directly in the browser (not being redirected from an internal section of the app).

Without that, if you had a route like `/app/dashbaord/main`, when you tried to open that URL, Nginx wouldn't find the file `app/dashboard/main` and would return a `404 Not found`, instead of returning the `index.html` and letting the Angular router handle it.

The last part, `=404` tells Nginx to return a `404` if it doesn't even find an `index.html` file. That's the default case. But you will normally always have an `index.html` file.

Save that file, we will use it soon.

This is the minimum Nginx configuration. You could finetune it more, depending on your case. If you want to explore more, read the [Nginx Beginner's Guide](http://nginx.org/en/docs/beginners_guide.html#conf_structure).


## Docker

If you don't know Docker yet, and you do at least some back-end stuff (deploying a front-end app counts), it might change your developer life. So, go ahead, [install Docker](https://docs.docker.com/engine/installation/) and follow the [Get Started guide](https://docs.docker.com/get-started/).

Now, let's assume you already know enough Docker to use it. Let's go to our details.

Here, we'll see how we can use Docker multi-stage builds [Docker build-time `ARG`s](https://docs.docker.com/engine/reference/builder/#arg). That will allow us to pass build-time variables during image creation. And with that, we'll be able to build different images for the different Angular CLI environments, by just passing an argument to `docker`. But we need to do a couple things first.

When you build your image, Docker normally "sends" all the files in the directory to the component of Docker that builds the image. If you have a `node_modules` directory, it will take some time doing sending that as `node_modules` directories tend to be huge and with lots of files. But you don't need `node_modules` to be copied to your Docker image, you will install everything inside and create a `node_modules` inside your container, so, sending all your `node_modules` is a waste of time.

The same way that you would add `node_modules` to your `.gitignore` file, you can use a `.dockerignore` file.

* Add a `.dockerignore` for `node_modules` with:

```
node_modules
```

Now, let's build our Docker image.

* Add a file named specifically `Dockerfile` in your directory, with:

```Dockerfile
# Stage 0, based on Node.js, to build and compile Angular
FROM node:8.6 as node

WORKDIR /app

COPY package.json /app/

RUN npm install

COPY ./ /app/

ARG env=prod

RUN npm run build -- --prod --environment $env


# Stage 1, based on Nginx, to have only the compiled app, ready for production with Nginx
FROM nginx:1.13

COPY --from=node /app/dist/ /usr/share/nginx/html

COPY ./nginx-custom.conf /etc/nginx/conf.d/default.conf

```

...now, let's check what all that is doing.

* This will tell Docker that we will start with a base [Node.js official image](https://hub.docker.com/_/node/), notice that you won't have to install and configure Node.js or anything, Docker does that for you:

```Dockerfile
FROM node:8.6 as node
```

...we also "named" this stage `node`, with the `as node`. We will use this name later.

* Our working directory will be `/app`, that will create that directory and go in there:

```Dockerfile
WORKDIR /app
```

* Now, copy the `package.json` from your source to inside the container. Just that file, before the rest of the source code, because we want to install everything the first time, but not everytime we change our source code. The next time we change our code, Docker will use the cached layers with everything installed (because the `package.json` hasn't changed) and will only compile our source code:

```Dockerfile
COPY package.json /app/
```

* Install all the dependencies, this will be cached until we change the `package.json` file (changing our dependencies). So it won't take very long installing everything every time we iterate in our source code, just the first time and when we update the dependencies (installed packages):

```Dockerfile
RUN npm install
```

* Now, after installing all the dependencies, we can copy our source code. This section will not be cached that much, because we'll be changing our source code constantly, but we already took advantage of Docker caching for all the package install steps in the commands above. So, let's copy our source code:

```Dockerfile
COPY ./ /app/
```

* And here's the trick that will allow us to use Angular CLI environments. We create an `ARG` that we will pass at build time, with a default value of `prod` (the default value for Angular CLI).

```Dockerfile
ARG env=prod
```

* Inside our container we don't have a global Angular CLI installation, so we cannot just use `ng build`, because it won't find `ng`. But as Angular CLI creates an NPM script that builds everything, we can just use it, with `npm run build`. But we need to pass parameters to `ng` and we cannot pass them directly because `npm` would try to interpret them. So first we add `--` to let `npm` that the next parameters are not for him, but for `ng`. Then, we pass the `--prod` parameter that [sets several things at once](https://github.com/angular/angular-cli/wiki/build#--dev-vs---prod-builds). That will take care of optimizing everything for production. And lastly, we pass the `--environment $env` parameter. See that we are using the "environment variable" `$env` that we created right above. This environment variable won't persist after building (as an environment variable), but we can use it to pass parameters to Docker at build time.

```Dockerfile
RUN npm run build -- --prod --environment $env
```

...that will build our app, to the default directory `./dist`. Which in this case will be `/app/dist/`.

* In the same file, we start another section (another "stage"), like if 2 `Dockerfile`s were concatenated. That's Docker multi-stage building. It almost just looks like concatenating `Dockerfile`s. So, let's start with an [official Nginx base image](https://hub.docker.com/_/nginx/) for this "stage":

```Dockerfile
FROM nginx:1.13
```

* Here's the Docker multi-stage trick. This is a normal `COPY`, but it has a `--from=node`. That `node` refers to the name we specified above in the `as node`. Here, although we are in an Nginx image, starting from scratch, we can copy files from a previous stage. So, we can just copy the compiled version of our app. That compiled version is based on the latest source code, and that latest compiled version only lives in the previous Docker "stage", for now. But we'll copy it to the Nginx directory, just as static files:

```Dockerfile
COPY --from=node /app/dist/ /usr/share/nginx/html
```

* Now, we'll override the `default.conf` file in Nginx with our custom `nginx-custom.conf` file that lets Angular router take care of it's routes:

```Dockerfile
COPY ./nginx-custom.conf /etc/nginx/conf.d/default.conf
```

...that's it for the `Dockerfile`! Doing that with scripts or any other method would be a lot more cumbersome.

## Build it

Now we can build our image, that will compile everything and create a Nginx image ready for serving our app.

If we just build it normally, it will use the production environment (`prod`).

* Build your image using the production environment, e.g.:

```bash
docker build -t my-angular-project:prod .
```

But we can build an image for each environment we have, by just passing the environment name as an argument to the build process. The same as we would pass it to `ng build --environment`. We just have to use Docker's `--build-arg` parameter.

* Build your image using the development environment, e.g.:

```bash
docker build -t my-angular-project:dev --build-arg env=dev .
```

## Test it

To check that your new Docker images are working, you can start a container based on them and see the results.

* Test your image for the production environment with:

```bash
docker run -p 80:80 my-angular-project:prod
```
* Open your browser in <http://localhost>.

You should see something very similar to:

<img src="./readme-assets/04.png">

...notice that it is served by Docker and not by Angular CLI (not in port `4200`). And notice that it says that you are running the "production" version of your front end App.

* Test your image for the development environment with:

```bash
docker run -p 80:80 my-angular-project:dev
```

* Open your browser in <http://localhost>.

You should see something very similar to:

<img src="./readme-assets/03.png">

...again, served by Docker and not by Angular CLI (not in port `4200`). And now you are using your "development" environment version.


## Done!

That's it! Angular in Docker, ready for production with great performance (thanks for Nginx). A lot less error prone (thanks to Docker multi-stage builds). Supporting Angular CLI environments, thanks to Docker's `ARG` and `--build-arg`.

You can also automatize that in a continuous integration/delivery environment or whatever you want very easily with those tricks.

There's a demo project with all what I described here in GitHub at: <https://github.com/tiangolo/angular-docker-multi-stage-example>. If you have any problem replicating this, check the repo and compare it to your code to see what could be wrong.

And let me know if this was helpful to you!

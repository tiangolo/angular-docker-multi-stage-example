import { environment } from '../environments/environment';
import { Component } from '@angular/core';

import {  } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'app';

  production = environment.production;
}

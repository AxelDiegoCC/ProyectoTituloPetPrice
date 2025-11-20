import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfigurationsPage } from './configurations.page';

describe('ConfigurationsPage', () => {
  let component: ConfigurationsPage;
  let fixture: ComponentFixture<ConfigurationsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ConfigurationsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

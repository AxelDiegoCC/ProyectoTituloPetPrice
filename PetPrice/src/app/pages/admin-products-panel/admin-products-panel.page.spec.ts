import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminProductsPanelPage } from './admin-products-panel.page';

describe('AdminProductsPanelPage', () => {
  let component: AdminProductsPanelPage;
  let fixture: ComponentFixture<AdminProductsPanelPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AdminProductsPanelPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

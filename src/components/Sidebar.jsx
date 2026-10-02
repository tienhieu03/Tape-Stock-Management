import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Package, ShoppingCart, Layers, DollarSign, Users } from 'lucide-react';
import { usePermission } from '../context/PermissionContext';

export default function Sidebar() {
  const { hasPermission } = usePermission();

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">Quản lý NVL</div>
      </div>

      <div className="sidebar-menu">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
          title="Home"
        >
          <Home size={20} />
          <span>Home</span>
        </NavLink>

        {hasPermission('nvl.view') && (
          <NavLink
            to="/nvl"
            className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
            title="NVL Chi Tiết"
          >
            <Package size={20} />
            <span>NVL Chi Tiết</span>
          </NavLink>
        )}

        {hasPermission('tape.view') && (
          <NavLink
            to="/tape"
            className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
            title="ACF Tape - Flux - Solder"
          >
            <Layers size={20} />
            <span>ACF Tape - Flux - Solder</span>
          </NavLink>  
        )}

        {hasPermission('po.view') && (
          <NavLink
            to="/follow-po"
            className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
            title="Follow PO"
          >
            <ShoppingCart size={20} />
            <span>Follow PO</span>
          </NavLink>
        )}

        {hasPermission('po.vendor') && (
          <NavLink
            to="/vendors"
            className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
            title="Quản lý Vendor"
          >
            <Users size={20} />
            <span>Quản lý Vendor</span>
          </NavLink>
        )}

        {hasPermission('expense.view') && (
          <NavLink
            to="/equipment-expense"
            className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
            title="Equipment Expense"
          >
            <DollarSign size={20} />
            <span>Equipment Expense</span>
          </NavLink>
        )}
      </div>
    </div>
  );
}

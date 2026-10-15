-- Migration: Add location to user_characters and location/age to character_templates
-- Run this in your Supabase SQL editor

-- Add location column to user_characters table
ALTER TABLE user_characters 
ADD COLUMN IF NOT EXISTS location TEXT;

-- Add location and age columns to character_templates table
ALTER TABLE character_templates 
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS age INTEGER CHECK (age >= 18);

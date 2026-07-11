Feature: Locale-prefixed auth routing via next-intl
  Spec: openspec/changes/vertical-slicing-reference-scaffold/specs/auth/spec.md

  Background:
    Given the application is running

  Scenario: /en/sign-in and /es/sign-in both render the sign-in screen in the requested locale
    Given the application is running
    When the user navigates to "/en/sign-in" or "/es/sign-in"
    Then the sign-in screen renders in English or Spanish respectively
    And the form labels, button text, and validation messages are translated via "next-intl"

  Scenario: Switching locale keeps the user on the same auth surface in the new locale
    Given the user is on "/en/sign-in"
    When the user changes the locale to "es"
    Then the user lands on "/es/sign-in" "same surface, new locale"
    And no form data is lost inadvertently
